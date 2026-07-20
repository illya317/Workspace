import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const packagesRoot = path.join(repositoryRoot, "packages");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return entry.isFile() && /\.[jt]sx?$/.test(entry.name) && !entry.name.includes(".test.")
      ? [absolutePath]
      : [];
  });
}

test("only the approval commit engine can issue approved-command authorization", () => {
  const issuers = sourceFiles(packagesRoot)
    .filter((file) => readFileSync(file, "utf8").includes("issueApprovalCommitAuthorization("))
    .map((file) => path.relative(repositoryRoot, file).split(path.sep).join("/"))
    .sort();

  assert.deepEqual(issuers, [
    "packages/platform/server/approval-commit-authorization.ts",
    "packages/platform/server/approvals/advance.ts",
  ]);
});

test("only approved command seams can consume approval authorization", () => {
  const consumers = sourceFiles(packagesRoot)
    .filter((file) => readFileSync(file, "utf8").includes("consumeApprovalCommitAuthorization("))
    .map((file) => path.relative(repositoryRoot, file).split(path.sep).join("/"))
    .sort();

  assert.deepEqual(consumers, [
    "packages/platform/server/approval-commit-authorization.ts",
    "packages/platform/server/business-action-executor.ts",
    "packages/platform/server/docs-editor/approvals.ts",
    "packages/work/server/task-approval-commit.ts",
  ]);
});

test("explicit workflow-approved writes stay behind capability-consuming approval seams", () => {
  const explicitBypassFiles = sourceFiles(packagesRoot)
    .filter((file) => readFileSync(file, "utf8").split("\n").some((line) => (
      /\b(?:authorization|mutationAuthorization|updateGuard):\s*["']workflow-approved["']/.test(line)
    )))
    .map((file) => path.relative(repositoryRoot, file).split(path.sep).join("/"))
    .sort();

  assert.deepEqual(explicitBypassFiles, [
    "packages/platform/server/docs-editor/approvals.ts",
    "packages/work/server/task-approval-adapter.ts",
    "packages/work/server/task-approval-commit.ts",
  ]);
});

test("workflow-aware Work sub-helpers are private and are not re-exported", () => {
  const commitSource = readFileSync(path.join(packagesRoot, "work/server/task-approval-commit.ts"), "utf8");
  const adapterSource = readFileSync(path.join(packagesRoot, "work/server/task-approval-adapter.ts"), "utf8");

  assert.doesNotMatch(commitSource, /export\s+(?:async\s+)?function\s+commit(?:WorkItem|Revision)Approval/);
  assert.doesNotMatch(adapterSource, /export\s*\{[^}]*commit(?:WorkItem|Revision)Approval[^}]*\}\s*from\s*["']\.\/task-approval-commit["']/s);
});

test("workflow-approved mutation bypasses cannot be implicit defaults", () => {
  const implicitBypasses = sourceFiles(packagesRoot)
    .flatMap((file) => readFileSync(file, "utf8").split("\n").map((line, index) => ({ file, line, index })))
    .filter(({ line }) => (
      /\?\?\s*["']workflow-approved["']/.test(line)
      || /:\s*[^;=]+(?<![=!<>])=(?!=)\s*["']workflow-approved["']/.test(line)
    ))
    .map(({ file, index }) => `${path.relative(repositoryRoot, file).split(path.sep).join("/")}:${index + 1}`);

  assert.deepEqual(implicitBypasses, []);
});
