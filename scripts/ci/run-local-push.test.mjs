import assert from "node:assert/strict";
import test from "node:test";

import { selectLocalPushCommands } from "./run-local-push.mjs";

test("C0 local push runs only documentation consistency", () => {
  assert.deepEqual(selectLocalPushCommands("C0"), [["npm", ["run", "docs:check"]]]);
});

test("non-C0 local push runs blockers, explicit changed checks, and all Node tests", () => {
  assert.deepEqual(selectLocalPushCommands("C2"), [
    ["npm", ["run", "db:migration:policy"]],
    ["npm", ["run", "check:blockers"]],
    ["npm", ["run", "check:changed"]],
    ["npm", ["run", "test:node"]],
  ]);
});

test("PRE_PUSH_FULL selects migration policy plus the authoritative full CI chain", () => {
  assert.deepEqual(selectLocalPushCommands("C0", true), [
    ["npm", ["run", "db:migration:policy"]],
    ["npm", ["run", "check:ci"]],
  ]);
});
