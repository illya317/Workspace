import assert from "node:assert/strict";
import test from "node:test";

import { resolveDataTableScroll, resolveSurfaceFrameClass, resolveTablePresentation } from "./table-presentation";

test("locks ordinary long-table headers inside a bounded scroll region", () => {
  const scroll = resolveDataTableScroll();
  assert.deepEqual(scroll, { x: true, y: "auto", maxHeight: "lg" });
  assert.match(resolveSurfaceFrameClass(undefined, scroll), /\boverflow-y-auto\b/);
  assert.ok(resolveSurfaceFrameClass(undefined, scroll).split(" ").includes("max-h-[36rem]"));
  assert.doesNotMatch(resolveSurfaceFrameClass("bordered", scroll), /\boverflow-hidden\b/);
  assert.match(resolveTablePresentation().head, /\bsticky\b/);
  assert.match(resolveTablePresentation().head, /\btop-0\b/);
  assert.match(resolveTablePresentation().head, /\bz-10\b/);
  assert.match(resolveTablePresentation({ header: "plain" }).head, /\bbg-white\b/);
});

test("keeps explicit hidden vertical overflow unbounded", () => {
  assert.deepEqual(resolveDataTableScroll(undefined, { x: false, y: "hidden" }), {
    x: false,
    y: "hidden",
  });
});

test("preserves matrix scrolling defaults and caller overrides", () => {
  assert.deepEqual(resolveDataTableScroll({ kind: "matrix" }), { x: true, y: "hidden" });
  assert.deepEqual(resolveDataTableScroll(undefined, { maxHeight: "sm" }), {
    x: true,
    y: "auto",
    maxHeight: "sm",
  });
});
