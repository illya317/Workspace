#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TEST_FILE_PATTERN = /(?:^e2e\/.*\.spec\.[cm]?[jt]sx?$|\.(?:spec|test)\.[cm]?[jt]sx?$)/i;
const FOCUS_PATTERN = /\b(?:test|it|describe)(?:\s*\.\s*describe)?\s*\.\s*(skip|only|todo|fixme)\s*\(/g;

export function findFocusedTests(source) {
  const findings = [];
  for (const match of source.matchAll(FOCUS_PATTERN)) {
    findings.push({
      kind: match[1],
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return findings;
}

function trackedTestFiles(cwd) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd, encoding: "buffer" });
  if (result.status !== 0) throw new Error(result.stderr.toString("utf8").trim() || "git ls-files failed");
  return result.stdout.toString("utf8").split("\0").filter((file) => (
    TEST_FILE_PATTERN.test(file) && fs.existsSync(path.join(cwd, file))
  ));
}

export function checkTestFocus(cwd = process.cwd()) {
  const root = path.resolve(cwd);
  const findings = [];
  const files = trackedTestFiles(root);
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const finding of findFocusedTests(source)) findings.push({ file, ...finding });
  }
  if (findings.length > 0) {
    throw new Error(`focused or skipped tests are forbidden:\n${findings
      .map((item) => `- ${item.file}:${item.line} test.${item.kind}`)
      .join("\n")}`);
  }
  return { checkedFiles: files.length, findings: [] };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = checkTestFocus(process.cwd());
    process.stdout.write(`Test focus gate passed (${result.checkedFiles} files).\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
