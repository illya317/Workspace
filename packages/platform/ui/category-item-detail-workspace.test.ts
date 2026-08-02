import assert from "node:assert/strict";
import test from "node:test";

import {
  createCategoryDirectItemSection,
  createCategoryItemDetailBody,
} from "./category-item-detail-workspace";

const selector = {
  kind: "list" as const,
  items: [{
    key: "category-a",
    value: { key: "category-a", name: "分类 A" },
    card: { title: "分类 A" },
  }],
  selectedId: "category-a",
  onSelect: () => undefined,
};

test("category item detail workspace keeps category, direct items, and detail in one split", () => {
  const body = createCategoryItemDetailBody({
    category: { label: "分类", selector },
    directItems: {
      key: "direct-items",
      title: "直属项",
      ariaLabel: "直属项",
      value: "item-a",
      options: [{ value: "item-a", label: "直属项 A", code: "A-001" }],
    },
    detailSections: [{ key: "detail", body: { kind: "section", empty: { content: "详情" } } }],
  });

  assert.equal(body.kind, "section");
  assert.equal(body.layout, "split");
  assert.equal(body.master.label, "分类");
  assert.deepEqual(body.desktop?.ratio, [1, 2]);
  assert.equal(body.detail.kind, "section");
  if (body.detail.kind === "section" && body.detail.layout !== "split") assert.deepEqual(body.detail.sections?.map((section) => section.key), ["direct-items", "detail"]);
});

test("direct item section owns the standard empty state", () => {
  const section = createCategoryDirectItemSection({
    key: "direct-items",
    title: "直属项",
    ariaLabel: "直属项",
    options: [],
    emptyText: "暂无直属项",
  });

  assert.equal(section.header?.title, "直属项");
  assert.equal(section.body.kind, "section");
  if (section.body.kind !== "section" || section.body.layout === "split") throw new Error("expected nested section body");
  assert.equal(section.body.sections?.[0]?.body.kind, "section");
  assert.equal(section.body.sections?.[0]?.body.empty?.content, "暂无直属项");
});
