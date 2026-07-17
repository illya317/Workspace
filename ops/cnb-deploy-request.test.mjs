import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createRequest, validateRequest } from "./cnb-deploy-request.mjs";
import { createLocalFullCiReceipt } from "../scripts/ci/local-full-ci-receipt.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("CNB deploy request binds exact source identity without GitHub evidence", async (context) => {
  const cwd = mkdtempSync(join(tmpdir(), "cnb-deploy-request-"));
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "init");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "user.email", "test@example.invalid");
  execFileSync("sh", ["-c", "printf source > source.txt && git add source.txt && git commit -m source"], { cwd });
  const sourceSha = git(cwd, "rev-parse", "HEAD");
  const sourceTree = git(cwd, "rev-parse", "HEAD^{tree}");
  const request = await createRequest({
    cwd,
    sourceSha,
    sourceRef: "main",
    repository: "illya317/Workspace",
    localFullCi: createLocalFullCiReceipt({ treeSha: sourceTree }),
  });
  assert.equal(request.source.commitSha, sourceSha);
  assert.equal(request.source.treeSha, git(cwd, "rev-parse", "HEAD^{tree}"));
  assert.equal(request.bootstrap, null);
  assert.equal(request.localFullCi.treeSha, sourceTree);
  await assert.doesNotReject(validateRequest({
    cwd,
    request,
    expectedSourceSha: sourceSha,
    expectedSourceTree: request.source.treeSha,
    expectedSourceRef: "main",
    expectedRepository: "illya317/Workspace",
  }));
  await assert.rejects(validateRequest({ cwd, request, expectedSourceSha: "f".repeat(40) }), /does not match release parent/);
  await assert.rejects(validateRequest({
    cwd,
    request: { ...request, localFullCi: { ...request.localFullCi, status: "skipped" } },
  }), /receipt contract is invalid/);
  assert.equal(JSON.stringify(request).includes("github"), false);
});
