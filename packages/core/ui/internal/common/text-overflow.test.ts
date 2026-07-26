import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { textOverflowTitle } from "./text-overflow";

test("extracts a complete title from plain and nested React text", () => {
  assert.equal(textOverflowTitle("完整文本"), "完整文本");
  assert.equal(
    textOverflowTitle(createElement("span", null, "中财融商", "（北京）", createElement("strong", null, "资本管理"))),
    "中财融商（北京）资本管理",
  );
});

test("does not invent a title for non-text content", () => {
  assert.equal(textOverflowTitle(null), undefined);
  assert.equal(textOverflowTitle(createElement("span")), undefined);
});
