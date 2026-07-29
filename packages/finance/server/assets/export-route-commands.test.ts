import assert from "node:assert/strict";
import test from "node:test";

import { buildFinanceAssetExportCommand } from "./export-route-commands";

test("asset accounting exports require the selected company and period", () => {
  const missingScope = buildFinanceAssetExportCommand({ view: "cards" });
  assert.equal(missingScope.ok, false);
  if (!missingScope.ok) assert.equal(missingScope.issue.field, "companyCode");
});

test("asset accounting exports accept every workbench view", () => {
  for (const view of ["cards", "period", "adjustments"] as const) {
    assert.equal(buildFinanceAssetExportCommand({
      view,
      companyCode: "FH",
      year: 2026,
      month: 6,
    }).ok, true);
  }
});
