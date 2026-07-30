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

const sourceSha = "a".repeat(40);
const treeSha = "b".repeat(40);
const baseSha = "c".repeat(40);
const identity = { baseSha, sourceSha, treeSha };

test("candidate receipt freezes only source and inexpensive configuration checks", () => {
  const receipt = createReleaseCandidateReceipt({ ...identity, completedAt: "2026-07-28T00:00:00.000Z" });
  assert.equal(validateReleaseCandidateReceipt(receipt, identity), receipt);
  assert.equal(receipt.status, "prepared");
  assert.deepEqual(receipt.checks, [
    "cnb-release-config",
    "tenant-config-dry-run",
    "tenant-permission-docs",
  ]);
  assert.equal(Object.hasOwn(receipt, "fullCi"), false);
});

test("one validation receipt binds the Git base/head dependency closure", () => {
  const receipt = createCnbReleaseGateReceipt({ ...identity, completedAt: "2026-07-28T00:00:00.000Z" });
  assert.equal(validateCnbReleaseGateReceipt(receipt, identity), receipt);
  assert.equal(receipt.scope, "git-base-head-with-dependency-closure");
  assert.equal(receipt.baseSha, baseSha);
  assert.deepEqual(receipt.checks, [
    "git-base-head",
    "affected-source-checks",
    "affected-dependency-closure",
    "selected-postgresql",
    "selected-playwright-when-applicable",
    "artifact-identity",
  ]);
  assert.equal(Object.hasOwn(receipt, "target"), false);
});

test("candidate and CNB receipts cannot substitute for one another or cross trees", () => {
  const candidate = createReleaseCandidateReceipt(identity);
  const gate = createCnbReleaseGateReceipt(identity);
  assert.throws(() => validateCnbReleaseGateReceipt(candidate, identity), /CNB release gate/);
  assert.throws(() => validateReleaseCandidateReceipt(gate, identity), /candidate receipt/);
  assert.throws(
    () => validateCnbReleaseGateReceipt(gate, { baseSha, sourceSha, treeSha: "d".repeat(40) }),
    /different source tree/,
  );
});

test("receipt CLI writes private atomic candidate and CNB evidence", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-release-gate-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const kind of ["candidate", "cnb"]) {
    const output = path.join(directory, `${kind}.json`);
    const createArgs = [`${kind}-create`, "--source", sourceSha, "--tree", treeSha, "--output", output];
    if (kind === "cnb") createArgs.push("--base", baseSha, "--runner", "local");
    main(createArgs);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(output, "utf8")).sourceSha, sourceSha);
    const verifyArgs = [`${kind}-verify`, "--source", sourceSha, "--tree", treeSha, "--file", output];
    if (kind === "cnb") verifyArgs.push("--base", baseSha);
    main(verifyArgs);
  }
});
