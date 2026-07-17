import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { existingTestFiles, findFocusedTests } from "./check-test-focus.mjs";

test("detects skip, only, and todo focus modifiers", () => {
  const fixture = [
    'test("normal", () => {});',
    "test" + '.skip("skip", () => {});',
    "describe" + ' . only("focus", () => {});',
    "it" + '.todo("later");',
    "test.describe" + '.fixme("broken", () => {});',
    "",
  ].join("\n");
  assert.deepEqual(findFocusedTests(fixture), [
    { kind: "skip", line: 2 },
    { kind: "only", line: 3 },
    { kind: "todo", line: 4 },
    { kind: "fixme", line: 5 },
  ]);
});

test("does not reject ordinary tests or assertion methods", () => {
  assert.deepEqual(findFocusedTests(`test("normal", () => {
  assert.equal(value.only, false);
});
`), []);
});

test("ignores tracked tests deleted in the current change", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-focus-deleted-"));
  try {
    fs.writeFileSync(path.join(root, "present.test.mjs"), "test fixture\n");
    assert.deepEqual(existingTestFiles(root, ["deleted.test.mjs", "present.test.mjs"]), ["present.test.mjs"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
