import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCnbReleaseGateReceipt,
  createReleaseCandidateReceipt,
  main,
  validateCnbReleaseGateReceipt,
  validateReleaseCandidateReceipt,
} from "./release-gate-receipt.mjs";

const identity = { treeId: "b".repeat(40), contentDigest: "c".repeat(64) };

test("candidate receipt freezes content and inexpensive configuration checks", () => {
  const receipt = createReleaseCandidateReceipt({ ...identity, completedAt: "2026-07-28T00:00:00.000Z" });
  assert.equal(validateReleaseCandidateReceipt(receipt, identity), receipt);
  assert.equal(receipt.status, "prepared");
  assert.equal(Object.hasOwn(receipt, "sourceSha"), false);
});

test("validation receipt proves one full source CI and one compile", () => {
  const receipt = createCnbReleaseGateReceipt({ ...identity, completedAt: "2026-07-28T00:00:00.000Z" });
  assert.equal(validateCnbReleaseGateReceipt(receipt, identity), receipt);
  assert.equal(receipt.scope, "full-repository");
  assert.deepEqual(receipt.checks, [
    "full-source-ci-once",
    "artifact-compile-once",
    "artifact-content-identity",
  ]);
  assert.equal(Object.hasOwn(receipt, "baseSha"), false);
});

test("candidate and validation receipts cannot substitute or cross content", () => {
  const candidate = createReleaseCandidateReceipt(identity);
  const validation = createCnbReleaseGateReceipt(identity);
  assert.throws(() => validateCnbReleaseGateReceipt(candidate, identity), /validation receipt/);
  assert.throws(() => validateReleaseCandidateReceipt(validation, identity), /candidate receipt/);
  assert.throws(() => validateCnbReleaseGateReceipt(validation, {
    ...identity,
    contentDigest: "d".repeat(64),
  }), /different candidate content/);
});

test("receipt CLI writes private atomic candidate and validation evidence", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-release-gate-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const kind of ["candidate", "cnb"]) {
    const output = path.join(directory, `${kind}.json`);
    const createArgs = [
      `${kind}-create`,
      "--content", identity.contentDigest,
      "--tree", identity.treeId,
      "--output", output,
    ];
    if (kind === "cnb") createArgs.push("--runner", "local");
    main(createArgs);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(output, "utf8")).contentDigest, identity.contentDigest);
    main([
      `${kind}-verify`,
      "--content", identity.contentDigest,
      "--tree", identity.treeId,
      "--file", output,
    ]);
  }
});
