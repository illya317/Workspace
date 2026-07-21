import assert from "node:assert/strict";
import test from "node:test";

import {
  getToolbarOptionInputClassName,
  TOOLBAR_FIXED_CHOICE_WIDTH_CLASS,
  TOOLBAR_FIXED_SEARCH_WIDTH_CLASS,
} from "./toolbar-styles";

test("toolbar autocomplete defaults to a compact desktop width", () => {
  const className = getToolbarOptionInputClassName("md");

  assert.match(className, /w-full/);
  assert.match(className, /sm:w-\[140px\]/);
  assert.match(className, /sm:min-w-\[140px\]/);
  assert.match(className, /sm:max-w-\[140px\]/);
});

test("toolbar fixed choices can keep their narrower explicit width", () => {
  const className = getToolbarOptionInputClassName("md", TOOLBAR_FIXED_CHOICE_WIDTH_CLASS);

  assert.match(className, /sm:w-\[120px\]/);
  assert.doesNotMatch(className, /sm:w-\[140px\]/);
});

test("toolbar search uses a compact desktop width", () => {
  assert.match(TOOLBAR_FIXED_SEARCH_WIDTH_CLASS, /sm:w-\[160px\]/);
  assert.match(TOOLBAR_FIXED_SEARCH_WIDTH_CLASS, /sm:min-w-\[160px\]/);
  assert.match(TOOLBAR_FIXED_SEARCH_WIDTH_CLASS, /sm:max-w-\[160px\]/);
});
