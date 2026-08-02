import assert from "node:assert/strict";
import test from "node:test";

import {
  groupVoucherAccountName,
  groupVoucherCompanySummary,
  groupVoucherOccurrenceDate,
} from "./group-voucher-presentation";
import { buildGroupVoucherSourceTrace } from "./group-voucher-source-audit";

test("group voucher summary orders distinct companies by company sequence", () => {
  assert.equal(groupVoucherCompanySummary([
    { companyId: 2, companyCode: "02", companyName: "丰华天力通", sortOrder: 20 },
    { companyId: 1, companyCode: "01", companyName: "丰华生物", sortOrder: 10 },
    { companyId: 2, companyCode: "02", companyName: "丰华天力通", sortOrder: 20 },
  ]), "丰华生物 ↔ 丰华天力通");
});

test("group voucher summary does not duplicate one-sided company names", () => {
  assert.equal(groupVoucherCompanySummary([
    { companyId: 1, companyCode: "01", companyName: "丰华制药", sortOrder: 10 },
    { companyId: 1, companyCode: "01", companyName: "丰华制药", sortOrder: 10 },
  ]), "丰华制药");
});

test("group voucher account names use concise statement labels instead of line notes", () => {
  assert.equal(groupVoucherAccountName("longTermInvest"), "长期股权投资");
  assert.equal(groupVoucherAccountName("otherPayables"), "其他应付款");
  assert.equal(groupVoucherAccountName("revenue"), "营业收入");
});

test("group voucher occurrence dates come from company-side source facts", () => {
  assert.equal(groupVoucherOccurrenceDate({
    voucherDate: "2025-03-14",
    postingDate: "2025-03-31",
  }), "2025-03-14");
  assert.equal(groupVoucherOccurrenceDate({
    openItemVoucherDate: "2025-04-01",
    openItemDocumentDate: "2025-03-28",
  }), "2025-04-01");
  assert.equal(groupVoucherOccurrenceDate({ openItemDocumentDate: "2025-03-28" }), "2025-03-28");
  assert.equal(groupVoucherOccurrenceDate({ cashFlowVoucherDate: "2025-05-09" }), "2025-05-09");
  assert.equal(groupVoucherOccurrenceDate({ postingDate: "2025-05-31" }), "2025-05-31");
  assert.equal(groupVoucherOccurrenceDate({}), null);
});

test("auxiliary-balance audit trace exposes original vouchers and reconciles to closing balance", () => {
  const rows = buildGroupVoucherSourceTrace({
    id: 25539,
    companyCode: "01",
    periodId: 1,
    accountId: 8446,
    openingDebit: 0,
    openingCredit: 3658080.07,
    closingDebit: 0,
    closingCredit: 3442080.07,
    period: { startDate: "2026-06-01", endDate: "2026-06-30" },
    account: { code: "122101", name: "其他应收款-单位", balanceDirection: "debit" },
    members: [{ memberId: 8 }],
  }, [
    {
      id: 700000,
      accountId: 8446,
      debit: 0,
      credit: 3658080.07,
      description: "历史往来",
      voucher: { voucherNo: "2025-12-记-0010", date: "2025-12-31", companyCode: "01" },
      account: { code: "122101", name: "其他应收款-单位" },
      auxiliaryLinks: [{ memberId: 8 }],
    },
    {
      id: 723137,
      accountId: 8446,
      debit: 216000,
      credit: 0,
      description: "付丰华悦通往来",
      voucher: { voucherNo: "2026-06-记-0015", date: "2026-06-18", companyCode: "01" },
      account: { code: "122101", name: "其他应收款-单位" },
      auxiliaryLinks: [{ memberId: 8 }],
    },
  ]);
  assert.deepEqual(rows.map((row) => row.sourceType), ["openingBalance", "historicalVoucher", "voucher", "closingBalance"]);
  assert.equal(rows[2]?.date, "2026-06-18");
  assert.equal(rows[2]?.voucherNo, "2026-06-记-0015");
  assert.equal(rows.some((row) => row.sourceType === "untracedMovement"), false);
});

test("auxiliary-balance audit trace marks activity that has no original voucher link", () => {
  const rows = buildGroupVoucherSourceTrace({
    id: 1,
    companyCode: "01",
    periodId: 1,
    accountId: 2,
    openingDebit: 100,
    openingCredit: 0,
    closingDebit: 140,
    closingCredit: 0,
    period: { startDate: "2026-06-01", endDate: "2026-06-30" },
    account: { code: "1221", name: "其他应收款", balanceDirection: "debit" },
    members: [{ memberId: 3 }],
  }, []);
  const untraced = rows.find((row) => row.sourceType === "untracedMovement");
  assert.equal(untraced?.debit, 40);
  assert.equal(untraced?.credit, 0);
});
