import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createReleaseArtifactReceipt,
  createReleaseSourceValidationReceipt,
  main,
  validateReleaseArtifactReceipt,
  validateReleaseSourceValidationReceipt,
} from "./release-gate-receipt.mjs";

const identity = {
  treeId: "b".repeat(40),
  contentDigest: "c".repeat(64),
  targetId: "monolith",
  runId: "ci-20260801T000000Z-cccccccccccc-11111111",
};

test("source validation and artifact evidence are independent receipts", () => {
  const source = createReleaseSourceValidationReceipt({ ...identity, runner: "local" });
  const artifact = createReleaseArtifactReceipt({ ...identity, targetId: "monolith", runner: "local" });
  assert.equal(validateReleaseSourceValidationReceipt(source, identity), source);
  assert.equal(validateReleaseArtifactReceipt(artifact, { ...identity, targetId: "monolith" }), artifact);
  assert.deepEqual(source.checks, ["aggregate-source-ci"]);
  assert.deepEqual(artifact.checks, ["artifact-compile-or-exact-cache-restore", "artifact-content-identity"]);
  assert.equal(source.command, "ops/publish.sh ci");
  assert.equal(artifact.command, "ops/publish.sh ci");
});

test("source and artifact receipts cannot substitute or cross content", () => {
  const source = createReleaseSourceValidationReceipt(identity);
  const artifact = createReleaseArtifactReceipt(identity);
  assert.throws(() => validateReleaseArtifactReceipt(source, identity), /artifact receipt/);
  assert.throws(() => validateReleaseArtifactReceipt(artifact, {
    ...identity,
    contentDigest: "d".repeat(64),
  }), /different candidate content/);
  assert.throws(
    () => validateReleaseSourceValidationReceipt(source, { ...identity, targetId: "finance" }),
    /source validation receipt contract/,
  );
});

test("receipt CLI writes private atomic evidence for each completed stage", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-release-gate-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const kind of ["source", "artifact"]) {
    const output = path.join(directory, `${kind}.json`);
    const createArgs = [
      `${kind}-create`,
      "--content", identity.contentDigest,
      "--tree", identity.treeId,
      "--output", output,
    ];
    createArgs.push("--runner", "local");
    createArgs.push("--target", "monolith");
    if (kind === "source") createArgs.push("--run-id", identity.runId);
    main(createArgs);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(output, "utf8")).contentDigest, identity.contentDigest);
    const verifyArgs = [
      `${kind}-verify`,
      "--content", identity.contentDigest,
      "--tree", identity.treeId,
      "--file", output,
    ];
    verifyArgs.push("--target", "monolith");
    if (kind === "source") verifyArgs.push("--run-id", identity.runId);
    main(verifyArgs);
  }
});

test("same-target source receipts from separate CI runs coexist and the earlier proof remains verifiable", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-release-source-runs-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const runIds = [
    "ci-20260801T000000Z-cccccccccccc-11111111",
    "ci-20260801T000001Z-cccccccccccc-22222222",
  ];
  for (const runId of runIds) {
    main([
      "source-create",
      "--content", identity.contentDigest,
      "--tree", identity.treeId,
      "--target", "finance",
      "--run-id", runId,
      "--output", path.join(directory, `source-validation-finance-${runId}.json`),
    ]);
  }
  assert.equal(statSync(path.join(directory, `source-validation-finance-${runIds[1]}.json`)).isFile(), true);
  assert.equal(main([
    "source-verify",
    "--content", identity.contentDigest,
    "--tree", identity.treeId,
    "--target", "finance",
    "--run-id", runIds[0],
    "--file", path.join(directory, `source-validation-finance-${runIds[0]}.json`),
  ]).targetId, "finance");
  assert.throws(() => main([
    "source-verify",
    "--content", identity.contentDigest,
    "--tree", identity.treeId,
    "--target", "finance",
    "--run-id", runIds[1],
    "--file", path.join(directory, `source-validation-finance-${runIds[0]}.json`),
  ]), /source validation receipt contract/);
});
