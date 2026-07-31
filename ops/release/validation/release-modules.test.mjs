import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { captureCandidateIdentity } from "../candidate/identity.mjs";
import {
  createCandidateReceipt,
  createValidationReceipt,
  validateCandidateReceipt,
  validateValidationReceipt,
} from "../contracts/release-receipt.mjs";
import { diagnoseSlowRelease } from "../diagnostics/slow-flow.mjs";
import { runFullSourceValidation } from "./full-source-validation.mjs";

test("candidate identity is content based and ignores commit metadata", () => {
  const first = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD" });
  const second = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD^{tree}" });
  assert.equal(first.contentDigest, second.contentDigest);
  assert.equal(first.treeId, second.treeId);
});

test("release receipts bind candidate content without a commit or base SHA gate", () => {
  const identity = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD" });
  const candidate = createCandidateReceipt(identity);
  const validation = createValidationReceipt({ ...identity, runner: "local" });
  assert.equal(validateCandidateReceipt(candidate, identity), candidate);
  assert.equal(validateValidationReceipt(validation, identity), validation);
  assert.equal(Object.hasOwn(candidate, "sourceSha"), false);
  assert.equal(Object.hasOwn(validation, "baseSha"), false);
});

test("full source validation reuses success and blocks accidental repeated failure", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-validation-"));
  const resultFile = path.join(directory, "result.json");
  const contentDigest = "a".repeat(64);
  let executions = 0;
  const execute = () => { executions += 1; return { status: 0, signal: null, error: null }; };
  const first = runFullSourceValidation({ contentDigest, resultFile, execute, now: () => 1_000 });
  const second = runFullSourceValidation({ contentDigest, resultFile, execute, now: () => 2_000 });
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(executions, 1);

  const failedFile = path.join(directory, "failed.json");
  runFullSourceValidation({
    contentDigest,
    resultFile: failedFile,
    execute: () => ({ status: 2, signal: null, error: null }),
    now: () => 3_000,
  });
  assert.throws(() => runFullSourceValidation({ contentDigest, resultFile: failedFile, execute }), /already consumed/);
});

test("slow release thresholds only diagnose and never block", () => {
  const report = diagnoseSlowRelease([
    { stage: "full-source-ci", durationMs: 901_000 },
    { stage: "full-source-ci", durationMs: 10 },
    { stage: "artifact-cache", durationMs: 5, cache: "miss" },
    { stage: "artifact-cache", durationMs: 5, cache: "miss" },
  ]);
  assert.equal(report.blocking, false);
  assert.deepEqual(report.diagnostics.map((item) => item.code).sort(), [
    "repeated-cache-miss",
    "repeated-expensive-stage",
    "slow-stage",
  ]);
});
