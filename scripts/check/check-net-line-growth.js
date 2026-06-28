#!/usr/bin/env node

const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const DEFAULT_LIMIT = 0;
const limit = Number.parseInt(process.env.NET_LINE_GROWTH_LIMIT ?? String(DEFAULT_LIMIT), 10);

const INCLUDED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".prisma",
  ".sql",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
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
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
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

function hasStagedChanges() {
  return lines(runGit(["diff", "--name-only", "--cached", "--"])).length > 0;
}

function extension(file) {
  const match = file.match(/(\.[A-Za-z0-9]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function isIncludedPath(file) {
  if (!file || EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(file))) return false;
  return INCLUDED_EXTENSIONS.has(extension(file));
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
    if (!statPaths(file).some(isIncludedPath)) return [];
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
    .filter(isIncludedPath)
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
  if (hasStagedChanges()) {
    return parseNumstat(runGit(["diff", "--numstat", "--cached", "--"]));
  }
  return [
    ...parseNumstat(runGit(["diff", "--numstat", "HEAD", "--"])),
    ...untrackedStats(),
  ];
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function printTopContributors(stats) {
  const contributors = stats
    .filter((item) => item.net > 0)
    .sort((left, right) => right.net - left.net || left.file.localeCompare(right.file))
    .slice(0, 12);
  if (contributors.length === 0) return;

  process.stderr.write("Top positive line contributors:\n");
  for (const item of contributors) {
    process.stderr.write(`  ${formatSigned(item.net)} ${item.file} (${item.source}, +${item.added}/-${item.deleted})\n`);
  }
}

if (!Number.isFinite(limit)) {
  process.stderr.write("NET_LINE_GROWTH_LIMIT must be an integer.\n");
  process.exit(1);
}

const stats = changedStats();
const added = stats.reduce((sum, item) => sum + item.added, 0);
const deleted = stats.reduce((sum, item) => sum + item.deleted, 0);
const net = added - deleted;

if (stats.length === 0) {
  process.stdout.write("No changed source/text files for net line growth check.\n");
  process.exit(0);
}

if (net > limit) {
  process.stderr.write(
    `Net line growth check failed: net ${formatSigned(net)} lines (+${added}/-${deleted}), limit ${formatSigned(limit)}.\n`,
  );
  process.stderr.write("Reduce net growth, delete obsolete code, or split only when the total changed + untracked lines do not grow.\n");
  process.stderr.write("For an intentional exception, rerun with NET_LINE_GROWTH_LIMIT=<allowed-net-lines>.\n");
  printTopContributors(stats);
  process.exit(1);
}

process.stdout.write(
  `Net line growth check passed: net ${formatSigned(net)} lines (+${added}/-${deleted}), limit ${formatSigned(limit)}.\n`,
);
