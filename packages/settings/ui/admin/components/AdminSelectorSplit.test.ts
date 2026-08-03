import assert from "node:assert/strict";
import test from "node:test";

import { createAdminSelectorSplitBody } from "./AdminSelectorSplit";

test("admin selector split forwards controlled tree expansion", () => {
  const expandedIds = new Set<string | number>(["parent"]);
  const toggles: Array<[string | number, boolean]> = [];
  const parent = {
    key: "parent",
    name: "父资源",
    children: [{ key: "child", name: "子资源" }],
  };

  const body = createAdminSelectorSplitBody({
    title: "资源模块",
    items: [parent],
    selectedId: null,
    sections: [],
    expandedIds,
    onToggle: (id, expanded) => toggles.push([id, expanded]),
    onSelect: () => undefined,
  });

  assert.equal(body.kind, "section");
  assert.equal(body.layout, "split");
  const masterBody = body.master.body;
  assert.equal(masterBody.kind, "selector");
  if (masterBody.kind !== "selector" || masterBody.selector.kind !== "tree") return;
  assert.deepEqual([...masterBody.selector.expandedIds ?? []], ["parent"]);
  masterBody.selector.onToggle?.("parent", false);
  assert.deepEqual(toggles, [["parent", false]]);
  assert.equal(masterBody.selector.items[0]?.children?.[0]?.key, "child");
});
