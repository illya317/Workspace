import assert from "node:assert/strict";
import test from "node:test";

import { STATEMENT_TABS } from "./statement-navigation";

test("财务报表顶层入口使用合并报表和单体报表命名", () => {
  assert.deepEqual(STATEMENT_TABS.map((item) => item.label), ["合并报表", "单体报表"]);
});
