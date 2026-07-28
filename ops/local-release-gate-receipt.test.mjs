import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalFullCiReceipt } from "../scripts/ci/local-full-ci-receipt.mjs";
import { createLocalUnitCiReceipt } from "../scripts/ci/local-unit-ci-receipt.mjs";
import { canonicalJson, sha256 } from "./deploy-unit-release.mjs";
import {
  createLocalReleaseGateReceipt,
  main,
  validateLocalReleaseGateReceipt,
} from "./local-release-gate-receipt.mjs";

const sourceSha = "a".repeat(40);
const treeSha = "b".repeat(40);

function receipt() {
  return createLocalReleaseGateReceipt({
    sourceSha,
    treeSha,
    fullCiReceipt: createLocalFullCiReceipt({ treeSha }),
    completedAt: "2026-07-27T00:00:00.000Z",
  });
}

function unitInputs() {
  const contract = {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-contract",
    id: "hr",
    graphSha256: "c".repeat(64),
    checks: {
      typecheckScopes: ["app-hr", "hr"],
      e2eSuites: ["module-readiness"],
    },
  };
  const manifest = {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-artifact",
    unit: {
      id: "hr",
      contractSha256: sha256(canonicalJson(contract)),
      graphSha256: contract.graphSha256,
    },
    source: { commitSha: sourceSha, treeSha },
    artifact: { sha256: "d".repeat(64) },
  };
  return {
    contract,
    manifest,
    unitCiReceipt: createLocalUnitCiReceipt({ unitId: "hr", sourceSha, treeSha }),
  };
}

test("release gate receipt binds full CI, source, tree, and the complete release checks", () => {
  const value = receipt();
  assert.equal(validateLocalReleaseGateReceipt(value, { sourceSha, treeSha }), value);
  assert.deepEqual(value.checks, [
    "full-ci",
    "disposable-postgresql-migrations",
    "resource-seed",
    "playwright-e2e",
  ]);
  assert.equal(value.fullCi.treeSha, treeSha);
});

test("release gate receipt rejects stale source, tree, or nested full CI evidence", () => {
  const value = receipt();
  assert.throws(
    () => validateLocalReleaseGateReceipt(value, { sourceSha: "c".repeat(40), treeSha }),
    /different source tree/,
  );
  assert.throws(
    () => validateLocalReleaseGateReceipt(value, { sourceSha, treeSha: "d".repeat(40) }),
    /different source tree/,
  );
  assert.throws(
    () => validateLocalReleaseGateReceipt({ ...value, fullCi: { ...value.fullCi, status: "skipped" } }, { sourceSha, treeSha }),
    /full CI receipt contract is invalid/,
  );
});

test("unit release gate receipt binds target, graph, compiler closure, artifact, and browser suites", () => {
  const { contract, manifest, unitCiReceipt } = unitInputs();
  const value = createLocalReleaseGateReceipt({
    sourceSha,
    treeSha,
    unitId: "hr",
    unitCiReceipt,
    unitContract: contract,
    unitManifest: manifest,
    completedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(validateLocalReleaseGateReceipt(value, {
    sourceSha,
    treeSha,
    scope: "unit",
    unitId: "hr",
  }), value);
  assert.equal(value.schemaVersion, 3);
  assert.deepEqual(value.scope, { kind: "unit", unitId: "hr" });
  assert.deepEqual(value.checks, [
    "release-unit-protocol",
    "deploy-unit-lint",
    "deploy-unit-node-tests",
    "deploy-unit-typecheck",
    "deploy-unit-production-build",
    "disposable-postgresql-migrations",
    "resource-seed",
    "deploy-unit-runtime-smoke",
    "deploy-unit-e2e",
  ]);
  assert.equal(value.unitCi.schemaVersion, 2);
  assert.deepEqual(value.unit.typecheckScopes, ["app-hr", "hr"]);
  assert.deepEqual(value.unit.e2eSuites, ["module-readiness"]);
  assert.equal(value.unit.artifactSha256, manifest.artifact.sha256);
});

test("Full and unit release receipts cannot be reused across target scopes", () => {
  const { contract, manifest, unitCiReceipt } = unitInputs();
  const unitReceipt = createLocalReleaseGateReceipt({
    sourceSha,
    treeSha,
    unitId: "hr",
    unitCiReceipt,
    unitContract: contract,
    unitManifest: manifest,
  });
  assert.throws(
    () => validateLocalReleaseGateReceipt(receipt(), {
      sourceSha,
      treeSha,
      scope: "unit",
      unitId: "hr",
    }),
    /unit release gate receipt contract is invalid/,
  );
  assert.throws(
    () => validateLocalReleaseGateReceipt(unitReceipt, { sourceSha, treeSha }),
    /Full release gate receipt contract is invalid/,
  );
  assert.throws(
    () => validateLocalReleaseGateReceipt(unitReceipt, {
      sourceSha,
      treeSha,
      scope: "unit",
      unitId: "finance",
    }),
    /unit release gate receipt contract is invalid/,
  );
});

test("receipt CLI writes a private atomic file and verifies it", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-release-gate-receipt-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fullCi = path.join(directory, "full-ci.json");
  const output = path.join(directory, "release.json");
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = () => true;
    writeFileSync(fullCi, `${JSON.stringify(createLocalFullCiReceipt({ treeSha }))}\n`);
    main(["create", "--source", sourceSha, "--tree", treeSha, "--full-ci", fullCi, "--output", output]);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(output, "utf8")).sourceSha, sourceSha);
    main(["verify", "--source", sourceSha, "--tree", treeSha, "--file", output]);
  } finally {
    process.stdout.write = originalWrite;
  }
});
