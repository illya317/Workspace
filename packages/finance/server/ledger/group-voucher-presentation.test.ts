import assert from "node:assert/strict";
import test from "node:test";

import {
  groupVoucherAccountName,
  groupVoucherCompanySummary,
} from "./group-voucher-presentation";

test("group voucher summary uses the first two distinct company short names", () => {
  assert.equal(groupVoucherCompanySummary([
    { entityName: "示例主体甲", counterpartyName: "示例主体乙" },
    { entityName: "示例主体乙", counterpartyName: "示例主体甲" },
  ]), "示例主体甲 ↔ 示例主体乙");
});

test("group voucher summary does not duplicate one-sided company names", () => {
  assert.equal(groupVoucherCompanySummary([
    { entityName: "示例主体甲", counterpartyName: null },
    { entityName: "示例主体甲", counterpartyName: null },
  ]), "示例主体甲");
});

test("group voucher account names use concise statement labels instead of line notes", () => {
  assert.equal(groupVoucherAccountName("longTermInvest"), "长期股权投资");
  assert.equal(groupVoucherAccountName("otherPayables"), "其他应付款");
  assert.equal(groupVoucherAccountName("revenue"), "营业收入");
});
