import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

function safeSegment(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized === "." || normalized === ".." || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new PersistenceError(field + " contains an invalid path segment");
  }
  return normalized;
}

const MAX_JSON_BYTES = 1024 * 1024;

function assertDirectory(path: string, field: string): void {
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new PersistenceError(field + " must not be a symbolic link");
    if (!info.isDirectory()) throw new PersistenceError(field + " must be a directory");
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new PersistenceError(field + " could not be inspected");
  }
}

export interface JsonCodec<T> {
  encode(value: T): unknown;
  decode(value: unknown): T;
}

/**
 * Small durable JSON store for the infrastructure foundation.
 *
 * Keys are deliberately restricted to a single safe filename segment.
 * Writes are completed to a private temporary file and fsynced before the
 * final rename. Existing-file replacement has a Windows-specific fallback
 * because Windows can reject rename-over-existing; a future database adapter
 * will provide a stronger transaction guarantee.
 */
export class DurableJsonStore<T> {
  private readonly rootDirectory: string;
  private readonly collection: string;

  constructor(rootDirectory: string, collection: string, private readonly codec: JsonCodec<T>) {
    const normalizedRoot = rootDirectory.trim();
    if (normalizedRoot.length === 0) throw new PersistenceError("storage root must not be empty");
    this.rootDirectory = normalizedRoot;
    this.collection = safeSegment(collection, "storage collection");
    assertDirectory(this.rootDirectory, "storage root");
    if (!(() => { try { lstatSync(this.rootDirectory); return true; } catch { return false; } })()) {
      mkdirSync(this.rootDirectory, { recursive: true, mode: 0o700 });
    }
    assertDirectory(this.rootDirectory, "storage root");
  }

  private collectionDirectory(): string {
    return join(this.rootDirectory, this.collection);
  }

  private fileFor(key: string): string {
    return join(this.collectionDirectory(), safeSegment(key, "storage key") + ".json");
  }

  private ensureCollectionDirectory(): string {
    const directory = this.collectionDirectory();
    assertDirectory(this.rootDirectory, "storage root");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    assertDirectory(directory, "storage collection");
    return directory;
  }

  private assertRegularFile(path: string): void {
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink()) throw new PersistenceError("persisted state must not be a symbolic link");
      if (!info.isFile()) throw new PersistenceError("persisted state must be a regular file");
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new PersistenceError("persisted state could not be inspected");
    }
  }

  save(key: string, value: T): void {
    const directory = this.ensureCollectionDirectory();
    const target = this.fileFor(key);
    const safeKey = safeSegment(key, "storage key");

    let encoded: string;
    try {
      encoded = JSON.stringify(this.codec.encode(value));
      if (encoded === undefined) throw new PersistenceError("failed to serialize persisted state: codec returned undefined");
      if (Buffer.byteLength(encoded, "utf8") > MAX_JSON_BYTES) {
        throw new PersistenceError("persisted state exceeds maximum size");
      }
    } catch (error) {
      throw new PersistenceError("failed to serialize persisted state: " + (error instanceof Error ? error.message : "unknown error"));
    }

    const temporary = join(directory, "." + safeKey + "." + process.pid + "." + randomUUID() + ".tmp");
    let descriptor: number | undefined;

    try {
      descriptor = openSync(temporary, "wx", 0o600);
      writeFileSync(descriptor, encoded, { encoding: "utf8" });
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;

      this.assertRegularFile(target);
      try {
        renameSync(temporary, target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST" && code !== "EPERM") throw error;

        // Never replace a symlink. This fallback exists only for platforms
        // where rename-over-existing is rejected (notably Windows).
        const targetInfo = lstatSync(target);
        if (targetInfo.isSymbolicLink() || !targetInfo.isFile()) {
          throw new PersistenceError("refusing to replace non-regular persisted state");
        }
        unlinkSync(target);
        renameSync(temporary, target);
      }
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      try { rmSync(temporary, { force: true }); } catch { /* best effort cleanup */ }
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("failed to persist state: " + (error instanceof Error ? error.message : "unknown error"));
    }
  }

  list(): readonly T[] {
    const directory = this.collectionDirectory();
    try {
      const info = lstatSync(directory);
      if (info.isSymbolicLink()) throw new PersistenceError("storage collection must not be a symbolic link");
      if (!info.isDirectory()) throw new PersistenceError("storage collection must be a directory");
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new PersistenceError("storage collection could not be inspected");
    }

    const entries = readdirSync(directory, { withFileTypes: true });
    const values: T[] = [];
    for (const entry of entries) {
      if (!entry.name.endsWith(".json")) continue;
      const key = entry.name.slice(0, -5);
      safeSegment(key, "storage key");
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new PersistenceError("persisted state must not be a symbolic link");
      if (!entry.isFile()) throw new PersistenceError("persisted state must be a regular file");
      const value = this.get(key);
      if (value !== undefined) values.push(value);
    }
    return Object.freeze(values);
  }

  get(key: string): T | undefined {
    const target = this.fileFor(key);
    try {
      this.assertRegularFile(target);
      const size = statSync(target).size;
      if (size > MAX_JSON_BYTES) throw new PersistenceError("persisted state exceeds maximum size");
      const text = readFileSync(target, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new PersistenceError("persisted state contains invalid JSON");
      }
      try {
        return this.codec.decode(parsed);
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("persisted state failed validation: " + (error instanceof Error ? error.message : "unknown error"));
      }
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new PersistenceError("failed to read persisted state: " + (error instanceof Error ? error.message : "unknown error"));
    }
  }
}
