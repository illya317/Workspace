import assert from "node:assert/strict";
import test from "node:test";

import { findFocusedTests } from "./check-test-focus.mjs";

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
