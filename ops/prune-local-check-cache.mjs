#!/usr/bin/env node

import { lstatSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const maximumBytes = Number(process.env.LOCAL_CHECK_CACHE_MAX_BYTES ?? 12 * 1024 ** 3);
const roots = [
  ".next/cache",
  ".cache/types",
  ".cache/tsbuild",
  ".cache/release-check",
].map((entry) => path.join(repositoryRoot, entry));

for (const root of roots) {
  try {
    if (lstatSync(root).isSymbolicLink()) throw new Error(`cache root cannot be a symlink: ${root}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function filesUnder(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) {
        const stat = statSync(target);
        files.push({ path: target, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    }
  }
  return files;
}

const now = Date.now();
let files = roots.flatMap(filesUnder);
for (const file of files.filter((entry) => now - entry.mtimeMs > retentionMs)) {
  rmSync(file.path, { force: true });
}
files = roots.flatMap(filesUnder).sort((left, right) => left.mtimeMs - right.mtimeMs);
let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
for (const file of files) {
  if (totalBytes <= maximumBytes) break;
  rmSync(file.path, { force: true });
  totalBytes -= file.size;
}
process.stdout.write(`Local check caches retained without source-hash invalidation; current size ${totalBytes} bytes, retention 7 days.\n`);
