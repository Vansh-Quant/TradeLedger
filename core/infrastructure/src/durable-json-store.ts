import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

function requireSafeKey(key: string): string {
  const normalized = key.trim();
  if (normalized.length === 0) throw new PersistenceError("storage key must not be empty");
  if (normalized === "." || normalized === "..") throw new PersistenceError("invalid storage key");
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new PersistenceError("storage key contains invalid characters");
  }
  return normalized;
}

export interface JsonCodec<T> {
  encode(value: T): unknown;
  decode(value: unknown): T;
}

export class DurableJsonStore<T> {
  constructor(
    private readonly rootDirectory: string,
    private readonly collection: string,
    private readonly codec: JsonCodec<T>,
  ) {
    if (rootDirectory.trim().length === 0) throw new PersistenceError("storage root must not be empty");
    if (!/^[A-Za-z0-9._-]+$/.test(collection)) throw new PersistenceError("invalid storage collection");
  }

  private fileFor(key: string): string {
    return join(this.rootDirectory, this.collection, `${requireSafeKey(key)}.json`);
  }

  async save(key: string, value: T): Promise<void> {
    const target = this.fileFor(key);
    const directory = dirname(target);
    await mkdir(directory, { recursive: true });

    let encoded: string;
    try {
      encoded = JSON.stringify(this.codec.encode(value));
    } catch (error) {
      throw new PersistenceError(
        `failed to serialize persisted state: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    const temporary = join(directory, `.${requireSafeKey(key)}.${process.pid}.${Date.now()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);

    try {
      await handle.writeFile(encoded, "utf8");
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new PersistenceError(
        `failed to write persisted state: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    await handle.close();

    try {
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new PersistenceError(
        `failed to atomically replace persisted state: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async get(key: string): Promise<T | undefined> {
    const target = this.fileFor(key);

    let text: string;
    try {
      text = await readFile(target, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return undefined;
      throw new PersistenceError(
        `failed to read persisted state: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

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
      throw new PersistenceError(
        `persisted state failed validation: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}
