import assert from "node:assert/strict";
import test from "node:test";
import { sectionCardClassName } from "./BodySurfaceSectionStack.styles";

test("primary body section owns the card frame", () => {
  const className = sectionCardClassName("single");
  assert.match(className, /\bborder\b/);
  assert.match(className, /\brounded-xl\b/);
  assert.match(className, /\bshadow-sm\b/);
});

test("nested body section uses hierarchy without another card frame", () => {
  const className = sectionCardClassName("single", true);
  assert.doesNotMatch(className, /\bborder\b/);
  assert.doesNotMatch(className, /\brounded-/);
  assert.doesNotMatch(className, /\bshadow-/);
  assert.equal(className, "space-y-4");
});

test("adjacent nested sections use a divider instead of card outlines", () => {
  const className = sectionCardClassName("last", true);
  assert.match(className, /\bborder-t\b/);
  assert.doesNotMatch(className, /\brounded-/);
  assert.doesNotMatch(className, /\bshadow-/);
});
