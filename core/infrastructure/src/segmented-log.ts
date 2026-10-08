import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PersistenceError } from "./durable-json-store.js";

export interface SegmentedLogEntry { readonly sequence: number; }

export interface SegmentedLogOptions<T extends SegmentedLogEntry> {
  readonly rootDirectory: string;
  readonly name: string;
  readonly encode: (value: T) => unknown;
  readonly decode: (value: unknown) => T;
  readonly segmentMaxBytes?: number;
}

export interface SegmentedLogStatus {
  readonly firstSequence: number;
  readonly latestSequence: number;
  readonly segmentCount: number;
  readonly segmentMaxBytes: number;
}

const DEFAULT_SEGMENT_MAX_BYTES = 256 * 1024;

function safeName(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(normalized)) throw new PersistenceError("segmented log name is invalid");
  return normalized;
}

function segmentName(prefix: string, sequence: number): string {
  return prefix + "-" + String(sequence).padStart(16, "0") + ".log";
}

function segmentStart(name: string, prefix: string): number | undefined {
  const expectedPrefix = prefix + "-";
  if (!name.startsWith(expectedPrefix) || !name.endsWith(".log")) return undefined;
  const raw = name.slice(expectedPrefix.length, -4);
  if (!/^\d{16}$/.test(raw)) return undefined;
  return Number(raw);
}

function assertSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new PersistenceError("segmented log sequence is invalid");
}

export class DurableSegmentedLog<T extends SegmentedLogEntry> {
  private readonly directory: string;
  private readonly prefix: string;
  private readonly encode: (value: T) => unknown;
  private readonly decode: (value: unknown) => T;
  private readonly segmentMaxBytes: number;

  constructor(options: SegmentedLogOptions<T>) {
    this.directory = join(options.rootDirectory.trim(), safeName(options.name));
    this.prefix = safeName(options.name);
    this.encode = options.encode;
    this.decode = options.decode;
    this.segmentMaxBytes = options.segmentMaxBytes ?? DEFAULT_SEGMENT_MAX_BYTES;
    if (!Number.isSafeInteger(this.segmentMaxBytes) || this.segmentMaxBytes < 1024) throw new PersistenceError("segmented log segmentMaxBytes is invalid");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.recover();
  }

  append(value: T): void {
    assertSequence(value.sequence);
    const latest = this.latestSequence();
    if (value.sequence !== latest + 1) throw new PersistenceError("segmented log sequence is not contiguous");
    const encoded = JSON.stringify(this.encode(value));
    if (encoded === undefined) throw new PersistenceError("segmented log entry is not serializable");
    const line = encoded + "\n";
    const target = this.currentSegmentPath(value.sequence);
    if (this.fileSize(target) > 0 && this.fileSize(target) + Buffer.byteLength(line, "utf8") > this.segmentMaxBytes) {
      this.writeDurably(segmentName(this.prefix, value.sequence), line);
    } else {
      this.appendDurably(target, line);
    }
  }

  appendMany(values: readonly T[]): void { for (const value of values) this.append(value); }

  listAfter(sequence: number): readonly T[] {
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new PersistenceError("segmented log after sequence is invalid");
    return Object.freeze(this.readAll().filter((entry) => entry.sequence > sequence));
  }

  listAll(): readonly T[] { return Object.freeze(this.readAll()); }

  latestSequence(): number {
    const paths = this.segmentPaths();
    if (paths.length === 0) return 0;
    const entries = this.readSegment(paths[paths.length - 1]!);
    return entries.length === 0 ? 0 : entries[entries.length - 1]!.sequence;
  }

  firstSequence(): number {
    const paths = this.segmentPaths();
    if (paths.length === 0) return 0;
    const entries = this.readSegment(paths[0]!);
    return entries.length === 0 ? 0 : entries[0]!.sequence;
  }

  status(): SegmentedLogStatus {
    return Object.freeze({
      firstSequence: this.firstSequence(),
      latestSequence: this.latestSequence(),
      segmentCount: this.segmentPaths().length,
      segmentMaxBytes: this.segmentMaxBytes,
    });
  }

  compactThrough(sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new PersistenceError("compact sequence is invalid");
    const paths = this.segmentPaths();
    for (let index = 0; index < paths.length - 1; index += 1) {
      const entries = this.readSegment(paths[index]!);
      if (entries.length > 0 && entries[entries.length - 1]!.sequence <= sequence) rmSync(paths[index]!, { force: true });
    }
    this.recover();
  }

  private recover(): void {
    const entries = this.readAll();
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index]!.sequence !== entries[index - 1]!.sequence + 1) throw new PersistenceError("segmented log contains a sequence gap or duplicate");
    }
  }

  private readAll(): T[] {
    const result: T[] = [];
    for (const path of this.segmentPaths()) result.push(...this.readSegment(path));
    return result;
  }

  private readSegment(path: string): T[] {
    this.assertRegularFile(path);
    const text = readFileSync(path, "utf8");
    if (text.length === 0) return [];
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const result: T[] = [];
    for (const line of lines) {
      if (line.trim().length === 0) throw new PersistenceError("segmented log contains an empty record");
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { throw new PersistenceError("segmented log contains invalid JSON"); }
      const value = this.decode(parsed);
      assertSequence(value.sequence);
      result.push(Object.freeze(value));
    }
    return result;
  }

  private segmentPaths(): string[] {
    return readdirSync(this.directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({ name: entry.name, start: segmentStart(entry.name, this.prefix) }))
      .filter((entry): entry is { name: string; start: number } => entry.start !== undefined)
      .sort((a, b) => a.start - b.start)
      .map((entry) => join(this.directory, entry.name));
  }

  private currentSegmentPath(sequence: number): string {
    const paths = this.segmentPaths();
    return paths.length === 0 ? join(this.directory, segmentName(this.prefix, sequence)) : paths[paths.length - 1]!;
  }

  private fileSize(path: string): number {
    try { return statSync(path).size; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw new PersistenceError("segmented log could not be inspected");
    }
  }

  private appendDurably(path: string, text: string): void {
    let fd: number | undefined;
    try {
      fd = openSync(path, "a", 0o600);
      writeFileSync(fd, text, { encoding: "utf8" });
      fsyncSync(fd);
    } catch (error) {
      throw new PersistenceError("segmented log append failed: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  private writeDurably(path: string, text: string): void {
    let fd: number | undefined;
    try {
      fd = openSync(path, "wx", 0o600);
      writeFileSync(fd, text, { encoding: "utf8" });
      fsyncSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        if (this.fileSize(path) === 0) {
          this.appendDurably(path, text);
          return;
        }
        throw new PersistenceError("segmented log segment already contains data");
      }
      throw new PersistenceError("segmented log segment creation failed: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  private assertRegularFile(path: string): void {
    try {
      if (!statSync(path).isFile()) throw new PersistenceError("segmented log segment is not a regular file");
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("segmented log segment could not be read");
    }
  }
}
