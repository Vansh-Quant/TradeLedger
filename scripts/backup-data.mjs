#!/usr/bin/env node
/**
 * Backs up the local TradeLedger state directory (JSON/JSONL persistence:
 * competition state, research runs — whatever lives under TRADELEDGER_DATA_DIR).
 *
 *   npm run backup:data                 -> backups/data-YYYYMMDD-HHMMSS/
 *   npm run backup:data -- --source D --dest E:/backups
 *
 * Safety properties:
 *   - read-only against the source (copies, never moves or edits)
 *   - never deletes or prunes anything
 *   - never touches Supabase (journal backups are a separate concern, see
 *     ROLLBACK_AND_RECOVERY.md)
 *   - writes a manifest.json with per-file sizes and SHA-256 checksums so a
 *     restore can be *verified*, not just assumed
 *
 * Exits non-zero if the source is missing or a file cannot be read, so CI can
 * tell a real backup from a silent no-op.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const source = resolve(root, arg("--source", process.env.TRADELEDGER_DATA_DIR ?? ".tradeledger-data"));

if (!existsSync(source)) {
  console.error(`backup:data: source "${source}" does not exist — nothing to back up.`);
  process.exit(1);
}
if (!statSync(source).isDirectory()) {
  console.error(`backup:data: source "${source}" is not a directory.`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const destRoot = resolve(root, arg("--dest", "backups"));
const dest = join(destRoot, `data-${stamp}`);
mkdirSync(dest, { recursive: true });

// Copy first, then hash the copies — the manifest describes what was written.
cpSync(source, dest, { recursive: true });

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const bytes = readFileSync(full);
      files.push({
        path: dest === full ? "." : `.${full.slice(dest.length).replaceAll("\\", "/")}`,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
walk(dest);

const manifest = {
  tool: "tradeledger backup:data",
  createdAt: new Date().toISOString(),
  source,
  destination: dest,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
};
writeFileSync(join(dest, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log(`backup:data: ${manifest.fileCount} file(s), ${manifest.totalBytes} bytes -> ${dest}`);
console.log(`backup:data: manifest written with SHA-256 checksums for verification.`);
