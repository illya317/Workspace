import assert from "node:assert/strict";
import test from "node:test";

import {
  groupVoucherAccountName,
  groupVoucherCompanySummary,
  groupVoucherOccurrenceDate,
} from "./group-voucher-presentation";

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
  assert.equal(groupVoucherOccurrenceDate({ voucherDate: "2025-03-14" }), "2025-03-14");
  assert.equal(groupVoucherOccurrenceDate({
    openItemVoucherDate: "2025-04-01",
    openItemDocumentDate: "2025-03-28",
  }), "2025-04-01");
  assert.equal(groupVoucherOccurrenceDate({ openItemDocumentDate: "2025-03-28" }), "2025-03-28");
  assert.equal(groupVoucherOccurrenceDate({ cashFlowVoucherDate: "2025-05-09" }), "2025-05-09");
  assert.equal(groupVoucherOccurrenceDate({}), null);
});
