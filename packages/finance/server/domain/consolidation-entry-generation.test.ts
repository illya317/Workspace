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
    currencyCode: overrides.currencyCode ?? "CNY",
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

test("uses the direct ownership relationship when an intermediate company is the investor", () => {
  const groups = buildInvestmentVoucherMatchGroups([
    fact(1, 2, null, 100, { voucherId: 10, investmentRole: "investment", accountCode: "1511" }),
    fact(2, 5, null, -60, { voucherId: 20, investmentRole: "equity", accountCode: "4001" }),
    fact(3, 5, null, -40, { voucherId: 20, investmentRole: "equity", accountCode: "4002" }),
  ], [
    { investorCompanyId: 1, investeeCompanyId: 2, shareRatio: 1 },
    { investorCompanyId: 2, investeeCompanyId: 5, shareRatio: 1 },
  ]);
  const group = groups.find((item) => item.rightCompanyId === 5);
  assert.equal(group?.leftCompanyId, 2);
  assert.equal(group?.status, "matched");
  assert.deepEqual(group?.rightFacts.map((item) => item.itemId), [2, 3]);
});

test("keeps all N:N voucher evidence and blocks a cross-currency non-wholly-owned investment", () => {
  const groups = buildInvestmentVoucherMatchGroups([
    fact(1, 2, null, 60, { voucherId: 10, investmentRole: "investment", currencyCode: "CNY" }),
    fact(2, 2, null, 40, { voucherId: 11, investmentRole: "investment", currencyCode: "CNY" }),
    fact(3, 5, null, -70, { voucherId: 20, investmentRole: "equity", currencyCode: "CAD" }),
    fact(4, 5, null, -30, { voucherId: 21, investmentRole: "equity", currencyCode: "CAD" }),
  ], [{ investorCompanyId: 2, investeeCompanyId: 5, shareRatio: 0.75 }]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.leftFacts.map((item) => item.itemId), [1, 2]);
  assert.deepEqual(groups[0]?.rightFacts.map((item) => item.itemId), [3, 4]);
  assert.equal(groups[0]?.status, "unresolved");
  assert.match(groups[0]?.differenceResolution ?? "", /75\.00%/);
  assert.match(groups[0]?.differenceResolution ?? "", /历史汇率/);
});

test("does not mirror cross-currency equity vouchers to the investor CNY carrying amount", () => {
  const groups = buildInvestmentVoucherMatchGroups([
    fact(1, 2, 5, 600, {
      investmentRole: "investment", currencyCode: "CNY",
    }),
    fact(2, 2, 5, 400, {
      investmentRole: "investment", currencyCode: "CNY",
    }),
    fact(3, 5, null, -150, { investmentRole: "equity", currencyCode: "CAD" }),
    fact(4, 5, null, -50, { investmentRole: "equity", currencyCode: "CAD" }),
  ], [{ investorCompanyId: 2, investeeCompanyId: 5, shareRatio: 0.75 }]);
  assert.equal(groups[0]?.status, "unresolved");
  assert.equal(groups[0]?.leftNetAmount, 1000);
  assert.equal(groups[0]?.rightNetAmount, -200);
  assert.deepEqual(groups[0]?.requiredActions, ["translateToCny", "allocateNonControllingInterest"]);
  assert.match(groups[0]?.matchingRule ?? "", /不按一侧账面成本镜像/);
  assert.match(groups[0]?.differenceResolution ?? "", /历史汇率/);
});

test("requires CNY translation even when both source ledgers use the same foreign currency", () => {
  const [group] = buildIntercompanyVoucherMatchGroups([
    fact(1, 8, 9, 100, { currencyCode: "CAD" }),
    fact(2, 9, 8, -100, { currencyCode: "CAD" }),
  ]);
  assert.equal(group?.status, "unresolved");
  assert.equal(group?.comparisonCurrencyCode, null);
  assert.deepEqual(group?.requiredActions, ["translateToCny"]);
});

test("does not infer an investee when multiple direct relationships have evidence", () => {
  const groups = buildInvestmentVoucherMatchGroups([
    fact(1, 1, null, 100, { voucherId: 10, investmentRole: "investment" }),
    fact(2, 2, null, -100, { voucherId: 20, investmentRole: "equity" }),
    fact(3, 3, null, -100, { voucherId: 30, investmentRole: "equity" }),
  ], [
    { investorCompanyId: 1, investeeCompanyId: 2, shareRatio: 1 },
    { investorCompanyId: 1, investeeCompanyId: 3, shareRatio: 1 },
  ]);
  assert.equal(groups.filter((group) => group.status === "matched").length, 0);
  assert.match(groups.find((group) => group.rightCompanyId === null)?.differenceResolution ?? "", /多个/);
});
