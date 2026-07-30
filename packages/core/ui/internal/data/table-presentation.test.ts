import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveDataTableLayoutClass,
  resolveDataTableScroll,
  resolveStandardTableColumnWidths,
  resolveStandardTableMinWidth,
  resolveSurfaceFrameClass,
  resolveTablePresentation,
} from "./table-presentation";

test("lets ordinary tables follow the page instead of creating an inner viewport", () => {
  const scroll = resolveDataTableScroll();
  assert.deepEqual(scroll, { x: false, y: "hidden" });
  assert.doesNotMatch(resolveSurfaceFrameClass(undefined, scroll), /\boverflow-[xy]-auto\b/);
  assert.doesNotMatch(resolveSurfaceFrameClass(undefined, scroll), /\bmax-h-/);
  assert.doesNotMatch(resolveTablePresentation().head, /\bsticky\b/);
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
  assert.deepEqual(resolveDataTableScroll(undefined, { x: true }), { x: true, y: "hidden" });
  assert.deepEqual(resolveDataTableScroll(undefined, { maxHeight: "sm" }), {
    x: true,
    y: "auto",
    maxHeight: "sm",
  });
  assert.match(resolveTablePresentation(undefined, "normal", { stickyHeader: true }).head, /\bsticky\b/);
});

test("adapts ordinary columns while keeping numeric and explicit columns compact", () => {
  assert.match(resolveDataTableLayoutClass(false), /\btable-auto\b/);
  assert.doesNotMatch(resolveDataTableLayoutClass(false), /\btable-fixed\b/);
  assert.match(resolveDataTableLayoutClass(true), /\btable-fixed\b/);
  assert.deepEqual(resolveStandardTableColumnWidths([
    {},
    { numeric: true },
    { width: "md" },
  ]), [null, "7rem", "10rem"]);
  assert.equal(resolveStandardTableMinWidth(7), undefined);
  assert.equal(resolveStandardTableMinWidth(7, { x: true }), "56rem");
});
