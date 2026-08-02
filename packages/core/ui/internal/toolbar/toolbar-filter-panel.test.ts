import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveToolbarFilterPanelFields,
  TOOLBAR_FILTER_PANEL_SURFACE_CLASS_NAME,
} from "./ToolbarFilterPanel.model";

test("filter panel uses intrinsic width with a viewport-safe maximum", () => {
  assert.equal(
    TOOLBAR_FILTER_PANEL_SURFACE_CLASS_NAME,
    "w-fit max-w-[min(28rem,calc(100vw-1rem))] overflow-hidden p-0",
  );
});

test("filter panel derives only non-default selections and their display labels", () => {
  const changes: string[] = [];
  const active = getActiveToolbarFilterPanelFields([
    {
      key: "category",
      label: "科目类型",
      value: "asset",
      options: [{ value: "asset", label: "资产" }],
      onChange: (value) => changes.push(value),
    },
    {
      key: "status",
      label: "复核状态",
      value: "",
      options: [{ value: "reviewed", label: "已复核" }],
      onChange: (value) => changes.push(value),
    },
  ]);

  assert.deepEqual(active.map(({ key, label, valueLabel }) => ({ key, label, valueLabel })), [
    { key: "category", label: "科目类型", valueLabel: "资产" },
  ]);
  active[0]?.onClear();
  assert.deepEqual(changes, [""]);
});
