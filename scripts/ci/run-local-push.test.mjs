import assert from "node:assert/strict";
import test from "node:test";

import { createLocalFullCiReceipt } from "./local-full-ci-receipt.mjs";
import { hasReusableFullCiReceipt, selectLocalPushCommands } from "./run-local-push.mjs";

const head = "a".repeat(40);
const tree = "b".repeat(40);

test("C0 local push runs only documentation consistency", () => {
  assert.deepEqual(selectLocalPushCommands({ riskClass: "C0" }), [["npm", ["run", "docs:check:light"]]]);
});

test("non-C0 local push runs one deduplicated code suite", () => {
  assert.deepEqual(selectLocalPushCommands({ riskClass: "C2" }), [
    ["npm", ["run", "db:migration:policy"]],
    ["npm", ["run", "check:push:code"]],
  ]);
});

test("C1 presentation-only push skips full blockers and all Node tests", () => {
  assert.deepEqual(selectLocalPushCommands({ riskClass: "C1", reasonCodes: ["presentation-only"] }), [
    ["npm", ["run", "db:migration:policy"]],
  ]);
  assert.deepEqual(selectLocalPushCommands({ riskClass: "C1", reasonCodes: ["impact-map"] }), [
    ["npm", ["run", "db:migration:policy"]],
    ["npm", ["run", "check:push:code"]],
  ]);
});

test("an exact-tree full CI receipt leaves only base-dependent migration policy", () => {
  for (const riskClass of ["C0", "C1", "C2", "C3"]) {
    assert.deepEqual(selectLocalPushCommands({ riskClass }, false, true), [
      ["npm", ["run", "db:migration:policy"]],
    ]);
  }
});

test("PRE_PUSH_FULL selects migration policy plus the authoritative full CI chain", () => {
  assert.deepEqual(selectLocalPushCommands({ riskClass: "C0" }, true, true), [
    ["npm", ["run", "db:migration:policy"]],
    ["npm", ["run", "check:ci"]],
  ]);
});

test("receipt reuse requires the selected head and exact tree, not the caller runtime", () => {
  const receipt = createLocalFullCiReceipt({ treeSha: tree });
  const gitCommand = (_cwd, args) => {
    const command = args.join(" ");
    if (command === "rev-parse HEAD^{commit}") return head;
    if (command === "rev-parse HEAD^{tree}") return tree;
    if (command === "rev-parse --git-path workspace-local-full-ci.json") return ".git/workspace-local-full-ci.json";
    throw new Error(`unexpected git command: ${command}`);
  };
  const options = {
    cwd: "/workspace",
    headSha: head,
    gitCommand,
    readFile: () => JSON.stringify(receipt),
  };

  assert.equal(hasReusableFullCiReceipt(options), true);
  assert.equal(hasReusableFullCiReceipt({ ...options, headSha: "c".repeat(40) }), false);
  assert.equal(hasReusableFullCiReceipt({
    ...options,
    readFile: () => JSON.stringify({
      ...createLocalFullCiReceipt({ treeSha: tree }),
      runtime: { nodeVersion: "v0.0.0", platform: "other", architecture: "other" },
    }),
  }), true);
  assert.equal(hasReusableFullCiReceipt({ ...options, env: { PRE_PUSH_FULL: "1" } }), false);
});
