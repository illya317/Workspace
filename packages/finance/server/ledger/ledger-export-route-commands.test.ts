import assert from "node:assert/strict";
import test from "node:test";

import { buildLedgerExportCommand } from "./ledger-export-route-commands";

test("ledger export accepts download views for group accounts and group vouchers", () => {
  assert.equal(buildLedgerExportCommand({ view: "groupAccounts" }).ok, true);
  assert.equal(buildLedgerExportCommand({
    view: "vouchers",
    voucherKind: "group",
    documentType: "allocation",
    origin: "system",
  }).ok, true);
});

test("asset tab exports require the selected company, period, and child tab", () => {
  const missingScope = buildLedgerExportCommand({ view: "assets", assetView: "cards" });
  assert.equal(missingScope.ok, false);
  if (!missingScope.ok) assert.equal(missingScope.issue.field, "companyCode");

  const missingView = buildLedgerExportCommand({
    view: "assets",
    companyCode: "FH",
    year: 2026,
    month: 6,
  });
  assert.equal(missingView.ok, false);
  if (!missingView.ok) assert.equal(missingView.issue.field, "assetView");

  assert.equal(buildLedgerExportCommand({
    view: "assets",
    companyCode: "FH",
    year: 2026,
    month: 6,
    assetView: "reconciliation",
  }).ok, true);
});
