import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIntercompanyVoucherMatchGroups,
  buildInvestmentVoucherMatchGroups,
  type ConsolidationVoucherMatchFact,
} from "./consolidation-entry-generation";

function fact(
  itemId: number,
  companyId: number,
  counterpartyCompanyId: number | null,
  signedAmount: number,
  overrides: Partial<ConsolidationVoucherMatchFact> = {},
): ConsolidationVoucherMatchFact {
  return {
    itemId,
    voucherId: overrides.voucherId ?? itemId,
    voucherNo: overrides.voucherNo ?? `记-${itemId}`,
    voucherDate: overrides.voucherDate ?? "2026-07-01",
    companyId,
    counterpartyCompanyId,
    accountCode: overrides.accountCode ?? "1221",
    accountName: overrides.accountName ?? "其他应收款",
    description: overrides.description ?? null,
    lineCode: overrides.lineCode === undefined ? "otherReceivableNet" : overrides.lineCode,
    signedAmount,
    currencyCode: "CNY",
    sourceFingerprint: `source-${itemId}`,
    investmentRole: overrides.investmentRole,
  };
}

test("matches all voucher lines for one company pair as an N:N group", () => {
  const result = buildIntercompanyVoucherMatchGroups([
    fact(1, 8, 9, 60), fact(2, 8, 9, 40),
    fact(3, 9, 8, -70), fact(4, 9, 8, -30),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.status, "matched");
  assert.deepEqual(result[0]?.leftFacts.map((item) => item.itemId), [1, 2]);
  assert.deepEqual(result[0]?.rightFacts.map((item) => item.itemId), [3, 4]);
  assert.equal(result[0]?.matchedAmount, 100);
});

test("keeps voucher facts visible when counterpart amount differs", () => {
  const [group] = buildIntercompanyVoucherMatchGroups([
    fact(1, 8, 9, 100), fact(2, 9, 8, -99),
  ]);
  assert.equal(group?.status, "difference");
  assert.equal(group?.differenceAmount, 1);
  assert.equal(group?.leftFacts.length, 1);
  assert.equal(group?.rightFacts.length, 1);
});

test("does not generate a match when a voucher line lacks report mapping", () => {
  const [group] = buildIntercompanyVoucherMatchGroups([
    fact(1, 8, 9, 100, { lineCode: null }), fact(2, 9, 8, -100),
  ]);
  assert.equal(group?.status, "unresolved");
  assert.match(group?.differenceResolution ?? "", /未映射/);
});

test("matches investment and equity vouchers only when candidate is unique", () => {
  const groups = buildInvestmentVoucherMatchGroups([
    fact(1, 1, null, 100, { voucherId: 10, investmentRole: "investment", accountCode: "1511" }),
    fact(2, 2, null, -60, { voucherId: 20, investmentRole: "equity", accountCode: "4001" }),
    fact(3, 2, null, -40, { voucherId: 20, investmentRole: "equity", accountCode: "4002" }),
  ], 1, [2]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.status, "matched");
  assert.deepEqual(groups[0]?.rightFacts.map((item) => item.itemId), [2, 3]);
});

test("leaves ambiguous same-date investment candidates unresolved", () => {
  const groups = buildInvestmentVoucherMatchGroups([
    fact(1, 1, null, 100, { voucherId: 10, investmentRole: "investment" }),
    fact(2, 2, null, -100, { voucherId: 20, investmentRole: "equity" }),
    fact(3, 3, null, -100, { voucherId: 30, investmentRole: "equity" }),
  ], 1, [2, 3]);
  assert.equal(groups.filter((group) => group.status === "matched").length, 0);
  assert.match(groups.find((group) => group.leftFacts.length > 0)?.differenceResolution ?? "", /多个/);
});
