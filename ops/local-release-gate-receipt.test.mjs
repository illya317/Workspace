import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalFullCiReceipt } from "../scripts/ci/local-full-ci-receipt.mjs";
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
