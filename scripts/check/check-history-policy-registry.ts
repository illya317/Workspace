#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { historyPolicyRegistry } from "../../packages/platform/server/history-policy-registry";

const ROOT = path.resolve(import.meta.dirname, "../..");
const HISTORY_HELPERS = new Set(["snapshotHistory", "ensureEditHistoryBaseline"]);
const SNAPSHOT_CALL_RE = /\b(snapshotHistory|ensureEditHistoryBaseline)\(\s*["']([A-Za-z0-9_]+)["']/g;
const CRUD_CONFIG_RE = /\bentityType\s*:\s*["']([A-Za-z0-9_]+)["'][\s\S]{0,500}?\bmodelKey\s*:/g;
const SOURCE_EXT_RE = /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i;

function gitFiles(paths: string[]) {
  const tracked = execFileSync("git", ["ls-files", ...paths], { cwd: ROOT, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", ...paths], { cwd: ROOT, encoding: "utf8" });
  return `${tracked}\n${untracked}`
    .split("\n")
    .map((file) => file.trim())
    .filter((file, index, files) => file && files.indexOf(file) === index)
    .filter((file) => fs.existsSync(path.join(ROOT, file)))
    .filter((file) => SOURCE_EXT_RE.test(file) && !file.startsWith("generated/"));
}

function read(file: string) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function collectLiteralHistoryCalls(files: string[]) {
  const calls = new Map<string, Array<{ file: string; helper: string }>>();
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(SNAPSHOT_CALL_RE)) {
      const helper = match[1];
      const entityType = match[2];
      if (!HISTORY_HELPERS.has(helper)) continue;
      const existing = calls.get(entityType) ?? [];
      existing.push({ file, helper });
      calls.set(entityType, existing);
    }
  }
  return calls;
}

function collectCrudConfigEntities(files: string[]) {
  const configs = new Map<string, Array<{ file: string }>>();
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(CRUD_CONFIG_RE)) {
      const entityType = match[1];
      const existing = configs.get(entityType) ?? [];
      existing.push({ file });
      configs.set(entityType, existing);
    }
  }
  return configs;
}

function collectManualEditHistoryWrites(files: string[]) {
  return files.filter((file) => {
    if (file === "packages/platform/server/history.ts") return false;
    return /\.editHistory\.create\s*\(/.test(read(file));
  });
}

function main() {
  const files = gitFiles(["app", "packages", "scripts"]);
  const registered = new Set(Object.keys(historyPolicyRegistry));
  const calls = collectLiteralHistoryCalls(files);
  const crudConfigs = collectCrudConfigEntities(files);
  const usedEntityTypes = [...new Set([...calls.keys(), ...crudConfigs.keys()])].sort();
  const missing = usedEntityTypes.filter((entityType) => !registered.has(entityType));
  const restoreIssues = Object.values(historyPolicyRegistry)
    .filter((policy) => policy.restore !== false)
    .filter((policy) => !policy.restore.omitFields?.includes("id"))
    .map((policy) => policy.entityType);
  const manualWrites = collectManualEditHistoryWrites(files);

  if (missing.length > 0 || restoreIssues.length > 0) {
    if (missing.length > 0) {
      process.stderr.write("History policy registry is missing snapshot entities:\n");
      for (const entityType of missing) {
        const locations = calls.get(entityType) ?? [];
        const configLocations = crudConfigs.get(entityType) ?? [];
        const locationText = [
          ...locations.map((item) => `${item.file} (${item.helper})`),
          ...configLocations.map((item) => `${item.file} (crud config)`),
        ].join(", ");
        process.stderr.write(`  - ${entityType}: ${locationText}\n`);
      }
    }
    if (restoreIssues.length > 0) {
      process.stderr.write("Restorable history policies must omit snapshot id before restore:\n");
      for (const entityType of restoreIssues) process.stderr.write(`  - ${entityType}\n`);
    }
    process.exit(1);
  }

  if (manualWrites.length > 0) {
    process.stderr.write("Direct EditHistory writes outside platform history are not allowed:\n");
    for (const file of manualWrites) process.stdout.write(`  - ${file}\n`);
    process.stderr.write("Use snapshotHistory / ensureEditHistoryBaseline and register entity policy instead.\n");
    process.exit(1);
  }

  process.stdout.write(`History policy registry OK: ${usedEntityTypes.length} history entity types registered.\n`);
}

main();
