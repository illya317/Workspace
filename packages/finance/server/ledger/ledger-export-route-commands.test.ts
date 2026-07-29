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
    exportMode: "detail",
  }).ok, true);
});

test("detail export is restricted to group vouchers", () => {
  const result = buildLedgerExportCommand({
    view: "vouchers",
    voucherKind: "standard",
    exportMode: "detail",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "exportMode");
});

test("counterparty exports validate annual and quarterly period ends", () => {
  assert.equal(buildLedgerExportCommand({
    view: "counterparty",
    companyCode: "FH",
    year: 2026,
    month: 12,
    periodKind: "year",
    category: "ar",
  }).ok, true);

  const invalidQuarter = buildLedgerExportCommand({
    view: "counterparty",
    companyCode: "FH",
    year: 2026,
    month: 5,
    periodKind: "quarter",
    category: "ar",
  });
  assert.equal(invalidQuarter.ok, false);
  if (!invalidQuarter.ok) assert.equal(invalidQuarter.issue.field, "month");
});

test("voucher exports validate annual and quarterly period ends", () => {
  assert.equal(buildLedgerExportCommand({
    view: "vouchers",
    companyCode: "FH",
    year: 2026,
    month: 12,
    periodKind: "year",
  }).ok, true);

  const invalidQuarter = buildLedgerExportCommand({
    view: "vouchers",
    voucherKind: "group",
    year: 2026,
    month: 5,
    periodKind: "quarter",
  });
  assert.equal(invalidQuarter.ok, false);
  if (!invalidQuarter.ok) assert.equal(invalidQuarter.issue.field, "month");
});

test("voucher history export is restricted to group vouchers with a cutoff period", () => {
  assert.equal(buildLedgerExportCommand({
    view: "vouchers",
    voucherKind: "group",
    year: 2026,
    month: 6,
    voucherPeriodScope: "history",
  }).ok, true);

  const standard = buildLedgerExportCommand({
    view: "vouchers",
    voucherKind: "standard",
    year: 2026,
    month: 6,
    voucherPeriodScope: "history",
  });
  assert.equal(standard.ok, false);
  if (!standard.ok) assert.equal(standard.issue.field, "voucherPeriodScope");
});
