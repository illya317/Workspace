import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createReleaseArtifactReceipt,
  createReleaseCandidateReceipt,
  createReleaseSourceValidationReceipt,
  main,
  validateReleaseArtifactReceipt,
  validateReleaseCandidateReceipt,
  validateReleaseSourceValidationReceipt,
} from "./release-gate-receipt.mjs";

const identity = { treeId: "b".repeat(40), contentDigest: "c".repeat(64) };

test("candidate receipt freezes content and inexpensive configuration checks", () => {
  const receipt = createReleaseCandidateReceipt({ ...identity, completedAt: "2026-07-28T00:00:00.000Z" });
  assert.equal(validateReleaseCandidateReceipt(receipt, identity), receipt);
  assert.equal(receipt.status, "prepared");
  assert.equal(Object.hasOwn(receipt, "sourceSha"), false);
});

test("source validation and artifact evidence are independent receipts", () => {
  const source = createReleaseSourceValidationReceipt({ ...identity, runner: "local" });
  const artifact = createReleaseArtifactReceipt({ ...identity, targetId: "monolith", runner: "local" });
  assert.equal(validateReleaseSourceValidationReceipt(source, identity), source);
  assert.equal(validateReleaseArtifactReceipt(artifact, { ...identity, targetId: "monolith" }), artifact);
  assert.deepEqual(source.checks, ["full-source-ci-once"]);
  assert.deepEqual(artifact.checks, ["artifact-compile-once", "artifact-content-identity"]);
  assert.equal(source.command, "ops/publish.sh validate");
  assert.equal(artifact.command, "ops/publish.sh build");
});

test("candidate, source, and artifact receipts cannot substitute or cross content", () => {
  const candidate = createReleaseCandidateReceipt(identity);
  const source = createReleaseSourceValidationReceipt(identity);
  const artifact = createReleaseArtifactReceipt(identity);
  assert.throws(() => validateReleaseSourceValidationReceipt(candidate, identity), /source validation receipt/);
  assert.throws(() => validateReleaseArtifactReceipt(source, identity), /artifact receipt/);
  assert.throws(() => validateReleaseCandidateReceipt(artifact, identity), /candidate receipt/);
  assert.throws(() => validateReleaseArtifactReceipt(artifact, {
    ...identity,
    contentDigest: "d".repeat(64),
  }), /different candidate content/);
});

test("receipt CLI writes private atomic evidence for each completed stage", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-release-gate-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const kind of ["candidate", "source", "artifact"]) {
    const output = path.join(directory, `${kind}.json`);
    const createArgs = [
      `${kind}-create`,
      "--content", identity.contentDigest,
      "--tree", identity.treeId,
      "--output", output,
    ];
    if (kind !== "candidate") createArgs.push("--runner", "local");
    if (kind === "artifact") createArgs.push("--target", "monolith");
    main(createArgs);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(output, "utf8")).contentDigest, identity.contentDigest);
    const verifyArgs = [
      `${kind}-verify`,
      "--content", identity.contentDigest,
      "--tree", identity.treeId,
      "--file", output,
    ];
    if (kind === "artifact") verifyArgs.push("--target", "monolith");
    main(verifyArgs);
  }
});
