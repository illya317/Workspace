import assert from "node:assert/strict";
import test from "node:test";
import { sectionVisibilityClassName } from "./body-surface-visibility";

test("desktop-only section exposes the shared mobile visibility hook", () => {
  assert.equal(sectionVisibilityClassName("desktop"), "body-surface-desktop-only max-sm:hidden");
  assert.equal(sectionVisibilityClassName("mobile"), "body-surface-mobile-only sm:hidden");
  assert.equal(sectionVisibilityClassName("always"), "");
});
