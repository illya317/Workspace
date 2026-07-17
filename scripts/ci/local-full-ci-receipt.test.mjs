import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalFullCiReceipt,
  validateLocalFullCiReceipt,
} from "./local-full-ci-receipt.mjs";

const tree = "a".repeat(40);

test("local full CI receipt binds the exact tree and runtime", () => {
  const receipt = createLocalFullCiReceipt({
    treeSha: tree,
    completedAt: "2026-07-17T00:00:00.000Z",
    nodeVersion: "v24.14.0",
    platform: "darwin",
    architecture: "arm64",
  });
  assert.equal(validateLocalFullCiReceipt(receipt, {
    treeSha: tree,
    nodeVersion: "v24.14.0",
    platform: "darwin",
    architecture: "arm64",
  }), receipt);
});

test("local full CI receipt rejects a different tree or runtime", () => {
  const receipt = createLocalFullCiReceipt({ treeSha: tree });
  assert.throws(
    () => validateLocalFullCiReceipt(receipt, { treeSha: "b".repeat(40) }),
    /different Git tree/,
  );
  assert.throws(
    () => validateLocalFullCiReceipt(receipt, { treeSha: tree, nodeVersion: "v24.99.0" }),
    /runtime does not match/,
  );
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
