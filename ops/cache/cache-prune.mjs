#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadCachePolicy, retentionMilliseconds } from "./cache-policy.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const PIN_FILE = "cache-pins.json";

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function safePolicyRoot(repositoryRoot, relativeRoot) {
  const root = path.resolve(repositoryRoot);
  const target = path.resolve(root, relativeRoot);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`cache root escapes repository: ${relativeRoot}`);
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`cache root cannot traverse a symlink: ${cursor}`);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  return target;
}

function sizeUnder(target) {
  let size = 0;
  const pending = [target];
  while (pending.length > 0) {
    const current = pending.pop();
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isFile()) {
      size += stat.size;
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(current)) pending.push(path.join(current, entry));
  }
  return size;
}

function childEntries(root, className, protectedKeys = new Set(), issues = []) {
  if (!fs.existsSync(root)) return [];
  let children;
  try { children = fs.readdirSync(root, { withFileTypes: true }); }
  catch (error) {
    issues.push({ path: root, code: error?.code ?? "UNKNOWN" });
    return [];
  }
  return children.flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    const target = path.join(root, entry.name);
    try {
      const stat = fs.statSync(target);
      return [{
        path: target,
        className,
        key: entry.name,
        mtimeMs: stat.mtimeMs,
        size: sizeUnder(target),
        protected: protectedKeys.has(entry.name),
      }];
    } catch (error) {
      issues.push({ path: target, code: error?.code ?? "UNKNOWN" });
      return [];
    }
  });
}

function fileEntries(root, className, issues = []) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    let children;
    try { children = fs.readdirSync(current, { withFileTypes: true }); }
    catch (error) {
      issues.push({ path: current, code: error?.code ?? "UNKNOWN" });
      continue;
    }
    for (const entry of children) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) {
        const stat = fs.statSync(target);
        files.push({ path: target, className, key: target, mtimeMs: stat.mtimeMs, size: stat.size, protected: false });
      }
    }
  }
  return files;
}

function pinFile(repositoryRoot, policy) {
  const artifactRoot = safePolicyRoot(repositoryRoot, policy.classes["deployed-artifact"].roots[0]);
  return path.join(artifactRoot, PIN_FILE);
}

export function readArtifactPins(repositoryRoot, policy) {
  const file = pinFile(repositoryRoot, policy);
  if (!fs.existsSync(file)) return { schemaVersion: 1, targets: {} };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (parsed?.schemaVersion !== 1 || !parsed.targets || typeof parsed.targets !== "object") {
    throw new Error("artifact cache pin file is invalid");
  }
  return parsed;
}

export function pinDeployedArtifact({
  repositoryRoot = process.cwd(),
  policy = loadCachePolicy(),
  targetId = "monolith",
  contentDigest,
  now = () => new Date(),
} = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(targetId)) throw new Error("artifact target id is invalid");
  if (!DIGEST_PATTERN.test(contentDigest ?? "")) throw new Error("artifact content digest is invalid");
  const artifactRoot = safePolicyRoot(repositoryRoot, policy.classes["deployed-artifact"].roots[0]);
  const artifactDirectory = path.join(artifactRoot, targetId, contentDigest);
  if (!fs.existsSync(artifactDirectory) || !fs.statSync(artifactDirectory).isDirectory()) {
    throw new Error(`deployed artifact is absent from cache: ${targetId}/${contentDigest}`);
  }
  const pins = readArtifactPins(repositoryRoot, policy);
  const prior = pins.targets[targetId] ?? {};
  pins.targets[targetId] = {
    production: contentDigest,
    rollback: prior.production && prior.production !== contentDigest ? prior.production : prior.rollback ?? null,
    updatedAt: now().toISOString(),
  };
  atomicWriteJson(pinFile(repositoryRoot, policy), pins);
  return pins.targets[targetId];
}

function pinnedDigests(pins) {
  return new Set(Object.values(pins.targets).flatMap((entry) => [entry.production, entry.rollback]).filter(Boolean));
}

function collectArtifactEntries(repositoryRoot, policy, pins, issues) {
  const root = safePolicyRoot(repositoryRoot, policy.classes["undeployed-artifact"].roots[0]);
  if (!fs.existsSync(root)) return [];
  const entries = [];
  let targets;
  try { targets = fs.readdirSync(root, { withFileTypes: true }); }
  catch (error) {
    issues.push({ path: root, code: error?.code ?? "UNKNOWN" });
    return [];
  }
  for (const target of targets) {
    if (!target.isDirectory() || target.name === "evidence") continue;
    const targetRoot = path.join(root, target.name);
    const targetPins = pins.targets[target.name] ?? {};
    const protectedDigests = new Set([targetPins.production, targetPins.rollback].filter(Boolean));
    for (const entry of childEntries(targetRoot, "undeployed-artifact", protectedDigests, issues)) {
      if (!DIGEST_PATTERN.test(entry.key)) continue;
      entries.push(entry);
    }
  }
  return entries;
}

function collectEntries(repositoryRoot, policy, pins, issues) {
  const entries = [];
  for (const className of ["validation-receipt", "compiler-cache"]) {
    for (const relativeRoot of policy.classes[className].roots) {
      const root = safePolicyRoot(repositoryRoot, relativeRoot);
      entries.push(...fileEntries(root, className, issues));
    }
  }
  for (const relativeRoot of policy.classes["runtime-temporary"].roots) {
    entries.push(...childEntries(safePolicyRoot(repositoryRoot, relativeRoot), "runtime-temporary", new Set(), issues));
  }
  const protectedEvidence = pinnedDigests(pins);
  for (const relativeRoot of policy.classes["failed-diagnostics"].roots) {
    entries.push(...childEntries(safePolicyRoot(repositoryRoot, relativeRoot), "failed-diagnostics", protectedEvidence, issues));
  }
  entries.push(...collectArtifactEntries(repositoryRoot, policy, pins, issues));
  return entries;
}

function removeEmptyDirectories(root, issues, removeRoot = true) {
  if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) return;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch (error) {
    if (error?.code !== "ENOENT") issues.push({ path: root, code: error?.code ?? "UNKNOWN" });
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) removeEmptyDirectories(path.join(root, entry.name), issues);
  }
  if (!removeRoot) return;
  try {
    if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
  } catch (error) {
    if (error?.code !== "ENOENT") issues.push({ path: root, code: error?.code ?? "UNKNOWN" });
  }
}

export function diskUsagePercent(repositoryRoot = process.cwd(), statfs = fs.statfsSync) {
  const facts = statfs(repositoryRoot);
  const blocks = Number(facts.blocks);
  const available = Number(facts.bavail);
  if (!Number.isFinite(blocks) || blocks <= 0 || !Number.isFinite(available)) return 0;
  return Math.max(0, Math.min(100, ((blocks - available) / blocks) * 100));
}

export function pruneCaches({
  repositoryRoot = process.cwd(),
  policy = loadCachePolicy(),
  now = () => Date.now(),
  dryRun = false,
  statfs = fs.statfsSync,
} = {}) {
  const root = path.resolve(repositoryRoot);
  const pins = readArtifactPins(root, policy);
  const issues = [];
  const entries = collectEntries(root, policy, pins, issues);
  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const removed = [];
  const selected = new Set();
  const select = (entry, reason) => {
    if (entry.protected || selected.has(entry.path)) return;
    if (!dryRun) {
      try { fs.rmSync(entry.path, { recursive: true, force: true }); }
      catch (error) {
        issues.push({ path: entry.path, code: error?.code ?? "UNKNOWN" });
        return;
      }
    }
    selected.add(entry.path);
    removed.push({ className: entry.className, path: path.relative(root, entry.path), size: entry.size, reason });
    totalBytes -= entry.size;
  };

  for (const entry of entries) {
    const retention = retentionMilliseconds(policy.classes[entry.className]);
    if (now() - entry.mtimeMs > retention) select(entry, "retention");
  }

  const remaining = entries
    .filter((entry) => !entry.protected && !selected.has(entry.path))
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.path.localeCompare(right.path));
  for (const entry of remaining) {
    const overCapacity = totalBytes > policy.totalMaxBytes;
    const overHighWatermark = !dryRun && diskUsagePercent(root, statfs) >= policy.diskHighWatermarkPercent;
    if (!overCapacity && !overHighWatermark) break;
    select(entry, overCapacity ? "capacity" : "disk-high-watermark");
  }

  if (!dryRun) {
    for (const className of ["validation-receipt", "compiler-cache", "failed-diagnostics", "runtime-temporary"]) {
      for (const relativeRoot of policy.classes[className].roots) {
        const cacheRoot = safePolicyRoot(root, relativeRoot);
        fs.mkdirSync(cacheRoot, { recursive: true });
        removeEmptyDirectories(cacheRoot, issues, false);
      }
    }
  }
  return {
    schemaVersion: 1,
    totalBytes,
    diskUsagePercent: diskUsagePercent(root, statfs),
    removed,
    pinnedArtifacts: [...pinnedDigests(pins)].sort(),
    issues: issues.map((issue) => ({
      path: path.relative(root, issue.path),
      code: issue.code,
    })),
  };
}

export function assertBuildSpace(options = {}) {
  const policy = options.policy ?? loadCachePolicy({ env: options.env });
  const report = pruneCaches({ ...options, policy });
  if (report.diskUsagePercent >= policy.diskStopBuildPercent) {
    throw new Error(
      `disk usage ${report.diskUsagePercent.toFixed(1)}% reached stop-build watermark ${policy.diskStopBuildPercent}%`,
    );
  }
  return report;
}

function parseArgs(argv) {
  const options = { command: argv[0] ?? "prune", repositoryRoot: process.cwd(), dryRun: false };
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--root") options.repositoryRoot = argv[++index];
    else if (key === "--policy") options.policyFile = argv[++index];
    else if (key === "--content") options.contentDigest = argv[++index];
    else if (key === "--target") options.targetId = argv[++index];
    else if (key === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown cache policy argument: ${key}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const policy = loadCachePolicy({ policyFile: options.policyFile, env: process.env });
  if (options.command === "pin") {
    const pinned = pinDeployedArtifact({ ...options, policy });
    process.stdout.write(`Pinned deployed artifact: production=${pinned.production}, rollback=${pinned.rollback ?? "none"}.\n`);
    return 0;
  }
  const report = options.command === "assert-build-space"
    ? assertBuildSpace({ ...options, policy })
    : options.command === "prune"
      ? pruneCaches({ ...options, policy })
      : null;
  if (!report) throw new Error("usage: cache-prune.mjs prune|assert-build-space|pin [options]");
  process.stdout.write(
    `Cache policy: ${report.removed.length} evicted, ${report.totalBytes} bytes retained, disk ${report.diskUsagePercent.toFixed(1)}%.\n`,
  );
  if (report.issues.length > 0) {
    process.stderr.write(`Cache policy warning: ${report.issues.length} inaccessible cache path(s) retained.\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
