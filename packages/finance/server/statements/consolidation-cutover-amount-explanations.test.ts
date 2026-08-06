import assert from "node:assert/strict";
import test from "node:test";

import type { AmountOriginResult } from "@workspace/finance/types/statement-explanation";

import { certifyCutoverAmountExplanations } from "./consolidation-cutover-amount-explanations";

const query = {
  key: "canada-parent-investment-fx-adjustment",
  classification: "parentInvestmentOpeningAdjustment" as const,
  sourceCompanyCode: "02",
  targetAmount: "-12124.40",
  currencyCode: "CNY",
  dateTo: "2025-12-31",
  accountHints: ["1511"],
  evidence: "1511 期初余额与历史投资凭证合计的唯一差额",
};

function result(status: AmountOriginResult["status"] = "exact"): AmountOriginResult {
  const evidence = {
    evidenceId: "ev_voucherLine_79ae3c06fa5fb2088e79451280df4578",
    sourceKind: "voucherLine" as const,
    sourceRecordId: "voucherItem:728035",
    sourceFingerprint: "79ae3c06fa5fb2088e79451280df45785077137c0c4bd1eec777cc03f9c7298d",
    amount: "-12124.40",
    currencyCode: "CNY",
    company: { id: 9, code: "02", name: "母公司" },
    date: "2022-12-30",
    period: { year: 2022, month: 12 },
    account: { id: 1, code: "1511", name: "长期股权投资" },
    voucher: {
      voucherId: 106920,
      voucherNo: "2022-12-记-0098",
      voucherDate: "2022-12-30",
      itemId: 728035,
      sortOrder: 1,
      counterpartAccounts: [{ id: 2, code: "660303", name: "汇兑损益" }],
    },
    consolidation: null,
    workbook: null,
    translation: null,
    label: "2022-12-记-0098 · 1511 长期股权投资",
    deepLink: null,
  };
  return {
    targetAmount: "-12124.40",
    explainedAmount: status === "exact" ? "-12124.40" : "0.00",
    residualAmount: status === "exact" ? "0.00" : "-12124.40",
    status,
    method: status === "exact" ? "direct" : null,
    accountingTreatment: "not_evaluated",
    bestExplanation: status === "exact"
      ? { method: "direct", rank: 1, evidence: [evidence], explainedAmount: "-12124.40", residualAmount: "0.00" }
      : null,
    alternatives: [],
    candidatesTruncated: false,
    budgets: {
      tolerance: "0.00", maxTerms: 1, maxSolutions: 1, maxCandidatesAfterFilter: 10,
      maxVisitedStates: 10, deadlineMs: 100, providerCandidateLimit: 10, amountWindowUpper: "12124.40",
    },
    versions: { orchestrator: "finance-amount-explanation-orchestrator-v1", solverAdapterId: null, solverAdapterVersion: null },
    fingerprints: { input: "input-fingerprint", output: "output-fingerprint" },
    stopReason: status === "exact" ? "direct_hit" : "no_solution",
    diagnostics: { scopeQueryCount: 1, providers: [], solver: null },
  };
}

test("certifies an exact configured opening adjustment and preserves stable evidence", async () => {
  const certified = await certifyCutoverAmountExplanations([query], "2025-12-31", {
    companyIdByCode: async (code) => code === "02" ? 9 : null,
    explain: async () => result(),
  });
  assert.equal(certified.length, 1);
  assert.equal(certified[0]?.classification, "parentInvestmentOpeningAdjustment");
  assert.equal(certified[0]?.evidence[0]?.sourceRecordId, "voucherItem:728035");
  assert.equal(certified[0]?.outputFingerprint, "output-fingerprint");
});

test("rejects a configured opening adjustment when the engine cannot prove it exactly", async () => {
  await assert.rejects(() => certifyCutoverAmountExplanations([query], "2025-12-31", {
    companyIdByCode: async () => 9,
    explain: async () => result("not_found"),
  }), /未取得零差额精确证据/);
});
