#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const EXCLUDED_PATH_PATTERNS = [
  /(^|\/)\.cache\//,
  /(^|\/)\.git\//,
  /(^|\/)\.next\//,
  /(^|\/)\.turbo\//,
  /(^|\/)coverage\//,
  /(^|\/)generated\//,
  /(^|\/)node_modules\//,
  /(^|\/)out\//,
  /(^|\/)tmp\//,
];

const SPLIT_NAME_PARTS = [
  "part",
  "parts",
  "helper",
  "helpers",
  "config",
  "configs",
  "constant",
  "constants",
  "field",
  "fields",
  "column",
  "columns",
  "model",
  "models",
  "option",
  "options",
  "util",
  "utils",
];

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout;
}

function lines(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function extension(file) {
  return path.extname(file).toLowerCase();
}

function isSourcePath(file) {
  if (!file || EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(file))) return false;
  return SOURCE_EXTENSIONS.has(extension(file));
}

function hasStagedChanges() {
  return lines(runGit(["diff", "--name-only", "--cached", "--"])).length > 0;
}

function statPaths(statPath) {
  if (!statPath.includes("=>")) return [statPath];
  const paths = [statPath];
  const right = statPath.replace(/^.*=>\s*/, "").replace(/[{}]/g, "").trim();
  if (right) paths.push(right);
  return paths;
}

function parseNumstat(stdout) {
  return lines(stdout).flatMap((line) => {
    const parts = line.split("\t");
    if (parts.length < 3) return [];
    const [addedText, deletedText, ...pathParts] = parts;
    if (addedText === "-" || deletedText === "-") return [];
    const added = Number.parseInt(addedText, 10);
    const deleted = Number.parseInt(deletedText, 10);
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) return [];
    const file = pathParts.join("\t");
    if (!statPaths(file).some(isSourcePath)) return [];
    return [{ file, added, deleted, net: added - deleted, source: "tracked" }];
  });
}

function countLines(file) {
  const content = fs.readFileSync(file, "utf8");
  if (content.length === 0) return 0;
  const parts = content.split(/\r?\n/);
  return content.endsWith("\n") ? parts.length - 1 : parts.length;
}

function untrackedStats() {
  return lines(runGit(["ls-files", "--others", "--exclude-standard"]))
    .filter(isSourcePath)
    .flatMap((file) => {
      try {
        const added = countLines(file);
        return [{ file, added, deleted: 0, net: added, source: "untracked" }];
      } catch {
        return [];
      }
    });
}

function changedStats() {
  if (hasStagedChanges()) return parseNumstat(runGit(["diff", "--numstat", "--cached", "--"]));
  return [
    ...parseNumstat(runGit(["diff", "--numstat", "HEAD", "--"])),
    ...untrackedStats(),
  ];
}

function stripExtension(file) {
  return file.replace(/\.[^.]+$/, "");
}

function basenameWithoutExtension(file) {
  return path.basename(stripExtension(file));
}

function normalizeNamePart(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function sharedStem(left, right) {
  const leftParts = normalizeNamePart(left);
  const rightParts = normalizeNamePart(right);
  let count = 0;
  while (count < leftParts.length && count < rightParts.length && leftParts[count] === rightParts[count]) {
    count += 1;
  }
  return count >= 1 ? leftParts.slice(0, count).join("-") : "";
}

function hasSplitNamePart(file) {
  const parts = normalizeNamePart(basenameWithoutExtension(file));
  return parts.some((part) => SPLIT_NAME_PARTS.includes(part));
}

function sameDirectory(left, right) {
  return path.dirname(left) === path.dirname(right);
}

function isSiblingSplit(rootFile, helperFile) {
  if (!sameDirectory(rootFile, helperFile)) return false;
  if (!hasSplitNamePart(helperFile)) return false;
  return Boolean(sharedStem(basenameWithoutExtension(rootFile), basenameWithoutExtension(helperFile)));
}

function importCandidates(importPath, fromFile) {
  if (!importPath.startsWith(".")) return [];
  const base = path.normalize(path.join(path.dirname(fromFile), importPath)).replace(/\\/g, "/");
  return [...SOURCE_EXTENSIONS].flatMap((ext) => [
    `${base}${ext}`,
    `${base}/index${ext}`,
  ]);
}

function importsInFile(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    const specs = [];
    const staticImport = /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g;
    const exportFrom = /\bexport\s+(?:type\s+)?[^'"]+\s+from\s+["']([^"']+)["']/g;
    const dynamicImport = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
    for (const regex of [staticImport, exportFrom, dynamicImport]) {
      let match = regex.exec(text);
      while (match) {
        specs.push(match[1]);
        match = regex.exec(text);
      }
    }
    return specs.flatMap((specifier) => importCandidates(specifier, file));
  } catch {
    return [];
  }
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function evaluateSplitQuality(stats, importsByFile = {}) {
  const byFile = new Map(stats.map((item) => [item.file, item]));
  const shrinkingRoots = stats.filter((item) => item.deleted > item.added);
  const growingFiles = stats.filter((item) => item.added > item.deleted);
  const growingSet = new Set(growingFiles.map((item) => item.file));
  const consumersByHelper = new Map();

  for (const root of shrinkingRoots) {
    const imports = importsByFile[root.file] ?? [];
    for (const target of imports) {
      if (!growingSet.has(target)) continue;
      const consumers = consumersByHelper.get(target) ?? [];
      consumers.push(root.file);
      consumersByHelper.set(target, consumers);
    }
  }

  const handledHelpers = new Set();
  const failures = [];
  const checked = [];

  for (const [helperFile, consumers] of consumersByHelper.entries()) {
    if (consumers.length < 2) continue;
    const helper = byFile.get(helperFile);
    const consumerStats = consumers.map((file) => byFile.get(file)).filter(Boolean);
    const consumerReduction = consumerStats.reduce((sum, item) => sum + Math.max(0, item.deleted - item.added), 0);
    const helperGrowth = Math.max(0, helper.added - helper.deleted);
    const group = {
      kind: "shared-helper",
      helper,
      consumers: consumerStats,
      reduction: consumerReduction,
      growth: helperGrowth,
      net: helperGrowth - consumerReduction,
    };
    checked.push(group);
    handledHelpers.add(helperFile);
    if (helperGrowth > consumerReduction) {
      failures.push({ ...group, reason: "shared helper growth is not covered by current consumers' reductions" });
    }
  }

  for (const root of shrinkingRoots) {
    const imports = new Set(importsByFile[root.file] ?? []);
    const helpers = growingFiles.filter((helper) => {
      if (handledHelpers.has(helper.file)) return false;
      return isSiblingSplit(root.file, helper.file) || imports.has(helper.file);
    });
    if (helpers.length === 0) continue;

    const rootReduction = Math.max(0, root.deleted - root.added);
    const helperGrowth = helpers.reduce((sum, item) => sum + Math.max(0, item.added - item.deleted), 0);
    const group = {
      kind: "single-root",
      root,
      helpers,
      reduction: rootReduction,
      growth: helperGrowth,
      net: helperGrowth - rootReduction,
    };
    checked.push(group);
    if (helperGrowth > rootReduction) {
      failures.push({ ...group, reason: "split files add more lines than the root file removes" });
    }
  }

  return { checked, failures };
}

function printFailure(failure) {
  process.stderr.write(`\n✗ ${failure.reason}\n`);
  process.stderr.write(`  kind: ${failure.kind}\n`);
  process.stderr.write(`  reduction/growth/net: -${failure.reduction}/+${failure.growth}/${formatSigned(failure.net)}\n`);
  if (failure.root) {
    process.stderr.write(`  root: ${failure.root.file} (+${failure.root.added}/-${failure.root.deleted})\n`);
  }
  if (failure.helper) {
    process.stderr.write(`  helper: ${failure.helper.file} (+${failure.helper.added}/-${failure.helper.deleted})\n`);
  }
  if (failure.helpers) {
    for (const helper of failure.helpers) {
      process.stderr.write(`  split: ${helper.file} (+${helper.added}/-${helper.deleted})\n`);
    }
  }
  if (failure.consumers) {
    for (const consumer of failure.consumers) {
      process.stderr.write(`  consumer: ${consumer.file} (+${consumer.added}/-${consumer.deleted})\n`);
    }
  }
}

function main() {
  const stats = changedStats();
  if (stats.length === 0) {
    process.stdout.write("No changed source files for split quality check.\n");
    return 0;
  }

  const importsByFile = Object.fromEntries(
    stats
      .filter((item) => item.deleted > item.added)
      .map((item) => [item.file, importsInFile(item.file)]),
  );
  const result = evaluateSplitQuality(stats, importsByFile);

  if (result.checked.length === 0) {
    process.stdout.write("Split quality check passed: no split-shaped changes detected.\n");
    return 0;
  }

  if (result.failures.length > 0) {
    process.stderr.write("Split quality check failed: splitting must reduce the touched group or prove current multi-root reuse.\n");
    for (const failure of result.failures) printFailure(failure);
    return 1;
  }

  process.stdout.write(`Split quality check passed: ${result.checked.length} split group(s) reduce code or prove current reuse.\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { evaluateSplitQuality };
