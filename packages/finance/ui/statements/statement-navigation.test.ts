import assert from "node:assert/strict";
import test from "node:test";

import { STATEMENT_TABS, WORKPAPER_TABS } from "./statement-navigation";

test("财务报表顶层入口使用合并报表、单体报表和差异诊断命名", () => {
  assert.deepEqual(STATEMENT_TABS.map((item) => item.label), ["合并报表", "单体报表", "差异诊断"]);
});

test("少数股东底稿位于外币底稿和合并底稿之间", () => {
  assert.deepEqual(WORKPAPER_TABS.map((item) => item.label), [
    "合并准备",
    "外币底稿",
    "少数股东底稿",
    "合并底稿",
    "合并报表",
  ]);
});
