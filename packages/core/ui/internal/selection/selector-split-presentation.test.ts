import assert from "node:assert/strict";
import test from "node:test";

import { resolveSelectorCardPresentation } from "./selector-split-presentation";

test("compact split master keeps identity, state, and one supporting fact", () => {
  const status = { label: "已登记", tone: "success" as const };
  const compact = resolveSelectorCardPresentation({
    title: "张慧君",
    code: "49.66%",
    subtitle: "自然人股东",
    meta: ["5,605.6 万元", "2022-06-27 至今"],
    status,
  }, "compact");

  assert.deepEqual(compact, {
    title: "张慧君",
    code: "49.66%",
    subtitle: undefined,
    meta: "5,605.6 万元",
    status,
  });
});

test("compact split master prefers an explicit meta line", () => {
  const compact = resolveSelectorCardPresentation({
    title: "合同 A",
    subtitle: "采购合同",
    meta: ["辅助信息", "2026-07-25"],
    metaLine: "CN-2026-001",
  }, "compact");

  assert.equal(compact.metaLine, "CN-2026-001");
  assert.equal(compact.subtitle, undefined);
  assert.equal(compact.meta, undefined);
});

test("default split master preserves the full card declaration", () => {
  const card = {
    title: "完整卡片",
    subtitle: "说明",
    meta: ["事实一", "事实二"],
  };
  assert.equal(resolveSelectorCardPresentation(card, "default"), card);
});
