import assert from "node:assert/strict";
import test from "node:test";

import { playwrightArguments } from "./run-selected-e2e.mjs";

test("full mode runs the complete Playwright suite", () => {
  assert.deepEqual(playwrightArguments("full", "[]"), ["playwright", "test"]);
});

test("targeted mode passes only validated spec paths", () => {
  assert.deepEqual(
    playwrightArguments("targeted", '["e2e/auth.spec.ts"]'),
    ["playwright", "test", "e2e/auth.spec.ts"],
  );
});

test("targeted mode fails closed for empty or option-like values", () => {
  assert.throws(() => playwrightArguments("targeted", "[]"), /non-empty array/);
  assert.throws(() => playwrightArguments("targeted", '["--grep"]'), /normalized/);
});
