import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLocalFullCiReceipt,
  validateLocalFullCiReceipt,
  writeLocalFullCiReceipt,
} from "./local-full-ci-receipt.mjs";

const tree = "a".repeat(40);

test("local full CI receipt binds the exact tree without host runtime identity", () => {
  const receipt = createLocalFullCiReceipt({
    treeSha: tree,
    completedAt: "2026-07-17T00:00:00.000Z",
  });
  assert.equal(validateLocalFullCiReceipt(receipt, { treeSha: tree }), receipt);
  assert.equal("runtime" in receipt, false);
});

test("local full CI receipt rejects a different tree", () => {
  const receipt = createLocalFullCiReceipt({ treeSha: tree });
  assert.throws(
    () => validateLocalFullCiReceipt(receipt, { treeSha: "b".repeat(40) }),
    /different Git tree/,
  );
});

test("legacy receipts remain reusable across host runtimes when the tree matches", () => {
  const receipt = {
    ...createLocalFullCiReceipt({ treeSha: tree }),
    runtime: { nodeVersion: "v25.9.0", platform: "darwin", architecture: "arm64" },
  };
  assert.equal(validateLocalFullCiReceipt(receipt, { treeSha: tree }), receipt);
});

test("local full CI receipt rejects forged command or status fields", () => {
  const receipt = createLocalFullCiReceipt({ treeSha: tree });
  assert.throws(
    () => validateLocalFullCiReceipt({ ...receipt, command: "npm test" }, { treeSha: tree }),
    /contract is invalid/,
  );
  assert.throws(
    () => validateLocalFullCiReceipt({ ...receipt, status: "skipped" }, { treeSha: tree }),
    /contract is invalid/,
  );
});

test("local full CI receipt is atomically written with private permissions", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-full-ci-receipt-"));
  const file = path.join(directory, "receipt.json");
  const receipt = createLocalFullCiReceipt({ treeSha: tree });
  try {
    writeLocalFullCiReceipt(file, receipt);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), receipt);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
