import assert from "node:assert/strict";
import test from "node:test";

import { groupVoucherFilterPanelItem } from "./groupVoucherToolbarItems";

test("group voucher low-frequency enums use the shared filter panel", () => {
  const changes: string[] = [];
  let resetCount = 0;
  const item = groupVoucherFilterPanelItem({
    documentType: "elimination",
    origin: "system",
    exportMode: "detail",
    periodScope: "history",
    onDocumentTypeChange: (value) => changes.push(`document:${value}`),
    onOriginChange: (value) => changes.push(`origin:${value}`),
    onExportModeChange: (value) => changes.push(`export:${value}`),
    onPeriodScopeChange: (value) => changes.push(`period:${value}`),
    onReset: () => { resetCount += 1; },
  });

  assert.equal(item.kind, "filter-panel");
  if (item.kind !== "filter-panel") return;
  assert.deepEqual(item.fields.map((field) => [field.label, field.value]), [
    ["凭证类别", "elimination"],
    ["生成方式", "system"],
    ["期间范围", "history"],
    ["导出内容", "detail"],
  ]);
  item.fields[0]?.onChange("");
  item.fields[1]?.onChange("manual");
  item.fields[2]?.onChange("");
  item.fields[3]?.onChange("");
  item.onReset?.();
  assert.deepEqual(changes, ["document:", "origin:manual", "period:current", "export:summary"]);
  assert.equal(resetCount, 1);
});
