#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const POLICY_FILE = "scripts/check/shell-errexit-policy.json";
const CATEGORIES = ["execution", "dependent", "structural", "diagnostic"];
const REQUIRED_ENTRY_BARRIERS = new Map();
const DIAGNOSTIC_PATH = /(?:^|\/)[^/]*(?:preflight|verify|health|patrol|diagnostic)[^/]*\.(?:bash|cjs|js|mjs|sh|ts|tsx)$/i;
const TEXT_EXTENSIONS = new Set([
  "", ".bash", ".cjs", ".js", ".json", ".mjs", ".sh", ".ts", ".tsx", ".yaml", ".yml",
]);
const ERREXIT_COMMAND = /(?:^|[\s;|&('"`])((?:set)[ \t]+(?:-[A-Za-z]*e[A-Za-z]*|-o[ \t]+errexit))(?=$|[\s;|&)'"`])/g;

function canonicalCommand(value) {
  return value.trim().replace(/[ \t]+/g, " ");
}

function groupKey(relativePath, command) {
  return `${relativePath}\0${command}`;
}

function trackedFiles(repositoryRoot) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "buffer" });
  if (result.error || result.status !== 0) {
    throw new Error(`cannot enumerate tracked files: ${result.error?.message ?? result.stderr?.toString("utf8").trim() ?? "git ls-files failed"}`);
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

function isTextCandidate(repositoryRoot, relativePath) {
  const extension = path.extname(relativePath);
  if (!TEXT_EXTENSIONS.has(extension)) return false;
  if (extension) return true;
  const absolute = path.join(repositoryRoot, relativePath);
  const firstLine = fs.readFileSync(absolute, "utf8").split(/\r?\n/, 1)[0] ?? "";
  return /^#!.*\b(?:ba|z|da|k)?sh\b/.test(firstLine);
}

export function scanErrexitSource(source, relativePath = "fixture.sh") {
  const occurrences = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trimStart();
    if (/^(?:#|\/\/|\*|<!--)/.test(trimmed)) continue;
    ERREXIT_COMMAND.lastIndex = 0;
    for (const match of line.matchAll(ERREXIT_COMMAND)) {
      occurrences.push({
        path: relativePath,
        line: index + 1,
        command: canonicalCommand(match[1]),
        previousLine: lines[index - 1]?.trim() ?? "",
      });
    }
  }
  return occurrences;
}

export function scanTrackedErrexit(repositoryRoot) {
  const occurrences = [];
  for (const relativePath of trackedFiles(repositoryRoot)) {
    if (relativePath === POLICY_FILE) continue;
    const absolute = path.join(repositoryRoot, relativePath);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!stat.isFile() || !isTextCandidate(repositoryRoot, relativePath)) continue;
    const source = fs.readFileSync(absolute, "utf8");
    if (source.includes("\0")) continue;
    occurrences.push(...scanErrexitSource(source, relativePath));
  }
  return occurrences;
}

function countOccurrences(occurrences) {
  const groups = new Map();
  for (const occurrence of occurrences) {
    const key = groupKey(occurrence.path, occurrence.command);
    const current = groups.get(key) ?? {
      path: occurrence.path,
      command: occurrence.command,
      count: 0,
      lines: [],
      previousLines: [],
    };
    current.count += 1;
    current.lines.push(occurrence.line);
    current.previousLines.push(occurrence.previousLine ?? "");
    groups.set(key, current);
  }
  return groups;
}

function policyGroups(policy, violations) {
  const groups = new Map();
  for (const entry of policy.entries ?? []) {
    const key = groupKey(entry.path, entry.command);
    if (groups.has(key)) {
      violations.push(`duplicate policy entry: ${entry.path}: ${entry.command}`);
      continue;
    }
    if (!entry.reason || typeof entry.reason !== "string") {
      violations.push(`policy entry is missing a reason: ${entry.path}: ${entry.command}`);
    }
    const requiredEntryBarrier = REQUIRED_ENTRY_BARRIERS.get(key);
    if (requiredEntryBarrier && (entry.counts?.execution ?? 0) > 0
      && entry.requiredPreviousLine !== requiredEntryBarrier) {
      violations.push(`${entry.path} execution errexit requires ${requiredEntryBarrier}`);
    }
    const unknownCategories = Object.keys(entry.counts ?? {}).filter((category) => !CATEGORIES.includes(category));
    for (const category of unknownCategories) {
      violations.push(`forbidden errexit category ${category}: ${entry.path}: ${entry.command}`);
    }
    const counts = Object.fromEntries(CATEGORIES.map((category) => [category, entry.counts?.[category] ?? 0]));
    for (const [category, count] of Object.entries(counts)) {
      if (!Number.isSafeInteger(count) || count < 0) {
        violations.push(`invalid ${category} count for ${entry.path}: ${entry.command}`);
      }
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (total === 0) violations.push(`empty policy entry: ${entry.path}: ${entry.command}`);
    let expectedLines = null;
    if (entry.lines !== undefined) {
      const unknownLineCategories = Object.keys(entry.lines).filter((category) => !CATEGORIES.includes(category));
      for (const category of unknownLineCategories) {
        violations.push(`forbidden errexit line category ${category}: ${entry.path}: ${entry.command}`);
      }
      expectedLines = [];
      for (const category of CATEGORIES) {
        const lines = entry.lines[category] ?? [];
        if (!Array.isArray(lines) || lines.some((line) => !Number.isSafeInteger(line) || line <= 0)) {
          violations.push(`invalid ${category} lines for ${entry.path}: ${entry.command}`);
          continue;
        }
        if (lines.length !== counts[category]) {
          violations.push(`${category} line count does not match classification count for ${entry.path}: ${entry.command}`);
        }
        expectedLines.push(...lines);
      }
      if (new Set(expectedLines).size !== expectedLines.length) {
        violations.push(`duplicate classified line for ${entry.path}: ${entry.command}`);
      }
      expectedLines.sort((left, right) => left - right);
    }
    groups.set(key, { ...entry, counts, total, expectedLines });
  }
  return groups;
}

export function validateErrexitPolicy({ policy, occurrences }) {
  const violations = [];
  if (policy?.schemaVersion !== 1) violations.push("shell errexit policy schemaVersion must be 1");
  if (policy?.diagnosticPolicy !== "prohibited") {
    violations.push("shell errexit diagnosticPolicy must be prohibited");
  }
  const actual = countOccurrences(occurrences);
  const classified = policyGroups(policy ?? {}, violations);

  for (const [key, group] of actual) {
    if (DIAGNOSTIC_PATH.test(group.path)) {
      violations.push(`diagnostic path cannot enable errexit: ${group.path}:${group.lines.join(",")} (${group.command})`);
    }
    const expected = classified.get(key);
    if (!expected) {
      violations.push(`unclassified errexit occurrence: ${group.path}:${group.lines.join(",")} (${group.command})`);
      continue;
    }
    if (expected.total !== group.count) {
      violations.push(`errexit count drift: ${group.path} (${group.command}) expected ${expected.total}, found ${group.count} at lines ${group.lines.join(",")}`);
    }
    if (expected.expectedLines && expected.expectedLines.join(",") !== group.lines.join(",")) {
      violations.push(`errexit location drift: ${group.path} (${group.command}) expected lines ${expected.expectedLines.join(",")}, found ${group.lines.join(",")}`);
    }
    if (expected.requiredPreviousLine
      && group.previousLines.some((previousLine) => previousLine !== expected.requiredPreviousLine)) {
      violations.push(`errexit barrier drift: ${group.path} (${group.command}) must immediately follow ${expected.requiredPreviousLine}`);
    }
  }
  for (const [key, entry] of classified) {
    if (!actual.has(key)) violations.push(`stale errexit policy entry: ${entry.path} (${entry.command})`);
  }

  const actualTotal = occurrences.length;
  const classifiedTotal = [...classified.values()].reduce((sum, entry) => sum + entry.total, 0);
  if (policy?.expectedOccurrenceCount !== actualTotal) {
    violations.push(`total errexit count drift: policy ${policy?.expectedOccurrenceCount ?? "missing"}, tracked source ${actualTotal}`);
  }
  if (classifiedTotal !== actualTotal) {
    violations.push(`classified errexit total ${classifiedTotal} does not match tracked source ${actualTotal}`);
  }

  for (const entry of classified.values()) {
    if (entry.counts.diagnostic > 0) {
      violations.push(`diagnostic/preflight errexit is prohibited: ${entry.path} (${entry.command}) classified ${entry.counts.diagnostic}`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    counts: {
      occurrences: actualTotal,
      execution: [...classified.values()].reduce((sum, entry) => sum + entry.counts.execution, 0),
      dependent: [...classified.values()].reduce((sum, entry) => sum + entry.counts.dependent, 0),
      structural: [...classified.values()].reduce((sum, entry) => sum + entry.counts.structural, 0),
      diagnostic: [...classified.values()].reduce((sum, entry) => sum + entry.counts.diagnostic, 0),
    },
  };
}

export function checkRepositoryErrexitPolicy(repositoryRoot = process.cwd(), policyFile = POLICY_FILE) {
  const policy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, policyFile), "utf8"));
  return validateErrexitPolicy({ policy, occurrences: scanTrackedErrexit(repositoryRoot) });
}

export function main() {
  const result = checkRepositoryErrexitPolicy();
  if (result.ok) {
    const { occurrences, execution, dependent, structural, diagnostic } = result.counts;
    console.log(`Shell errexit policy passed: total=${occurrences} execution=${execution} dependent=${dependent} structural=${structural} diagnostic=${diagnostic}.`);
    return 0;
  }
  console.error("Shell errexit policy violations:");
  for (const violation of result.violations) console.error(`- ${violation}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
