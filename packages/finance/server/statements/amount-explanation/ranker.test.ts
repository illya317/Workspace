import assert from "node:assert/strict";
import test from "node:test";

import type { EvidenceRef } from "@workspace/finance/types/statement-explanation";

import { normalizeQuery, type NormalizedQuery } from "./query";
import type { EvidenceCandidate } from "./providers/provider";
import { rankExplanations } from "./ranker";

function makeCandidate(evidenceId: string, overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  const evidence: EvidenceRef = {
    evidenceId,
    sourceKind: "voucherLine",
    sourceRecordId: `voucherItem:${evidenceId}`,
    sourceFingerprint: evidenceId,
    amount: "100.00",
    currencyCode: "CNY",
    company: { id: 1, code: "C001", name: "示例公司甲" },
    date: "2024-01-15",
    period: { year: 2024, month: 1 },
    account: { id: 55, code: "151101", name: "测试科目A" },
    voucher: null,
    consolidation: null,
    workbook: null,
    translation: null,
    label: evidenceId,
    deepLink: null,
  };
  return {
    evidence,
    amountMinor: 10000n,
    companyId: 1,
    accountCode: "151101",
    periodKey: "2024-01",
    lineCode: null,
    completeness: 3,
    providerOrder: 0,
    ...overrides,
  };
}

function adHocQuery(): NormalizedQuery {
  return normalizeQuery({
    targetAmount: "100.00",
    currencyCode: "CNY",
    companyIds: [1],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
  });
}

test("residual precedence beats term count", () => {
  const nearOneTerm = { evidence: [makeCandidate("a")], residualMinor: 1n };
  const exactTwoTerms = { evidence: [makeCandidate("b"), makeCandidate("c")], residualMinor: 0n };
  const { ranked } = rankExplanations([nearOneTerm, exactTwoTerms], adHocQuery());
  assert.equal(ranked[0]!.explanation, exactTwoTerms);
});

test("fewer terms win at equal residual", () => {
  const oneTerm = { evidence: [makeCandidate("a")], residualMinor: 5n };
  const twoTerms = { evidence: [makeCandidate("b"), makeCandidate("c")], residualMinor: 5n };
  const { ranked } = rankExplanations([twoTerms, oneTerm], adHocQuery());
  assert.equal(ranked[0]!.explanation, oneTerm);
});

test("context proximity wins at equal residual and term count", () => {
  const query = normalizeQuery({
    targetAmount: "100.00",
    currencyCode: "CNY",
    companyIds: [1],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    accountHints: ["1511"],
    reportContext: {
      target: {
        kind: "entity",
        companyId: 1,
        year: 2024,
        month: 1,
        periodKind: "monthly",
        reportType: "balance",
        targetFingerprint: "a".repeat(64),
      },
    },
  });
  const close = {
    evidence: [makeCandidate("close", { companyId: 1, accountCode: "151101", periodKey: "2024-01" })],
    residualMinor: 5n,
  };
  const far = {
    evidence: [makeCandidate("far", { companyId: 2, accountCode: "9999", periodKey: "2020-01" })],
    residualMinor: 5n,
  };
  const { ranked, ambiguous } = rankExplanations([far, close], query);
  assert.equal(ranked[0]!.explanation, close);
  assert.equal(ambiguous, false);
});

test("equal rank keys produce ambiguity instead of a silent pick", () => {
  const left = { evidence: [makeCandidate("aaa")], residualMinor: 5n };
  const right = { evidence: [makeCandidate("bbb")], residualMinor: 5n };
  const { ranked, ambiguous } = rankExplanations([right, left], adHocQuery());
  assert.equal(ambiguous, true);
  // 稳定顺序兜底：确定性输出，两次运行一致。
  const again = rankExplanations([left, right], adHocQuery());
  assert.equal(ranked[0]!.explanation, again.ranked[0]!.explanation);
});

test("ranking is deterministic under shuffled input", () => {
  const explanations = [
    { evidence: [makeCandidate("a", { completeness: 2 })], residualMinor: 9n },
    { evidence: [makeCandidate("b")], residualMinor: 3n },
    { evidence: [makeCandidate("c"), makeCandidate("d")], residualMinor: 0n },
    { evidence: [makeCandidate("e")], residualMinor: 3n },
  ];
  const forward = rankExplanations(explanations, adHocQuery());
  const shuffled = rankExplanations([...explanations].reverse(), adHocQuery());
  assert.deepEqual(
    forward.ranked.map((entry) => entry.explanation.residualMinor),
    shuffled.ranked.map((entry) => entry.explanation.residualMinor),
  );
  assert.deepEqual(
    forward.ranked.map((entry) => entry.explanation.evidence.map((evidence) => evidence.evidence.evidenceId)),
    shuffled.ranked.map((entry) => entry.explanation.evidence.map((evidence) => evidence.evidence.evidenceId)),
  );
});
