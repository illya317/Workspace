import assert from "node:assert/strict";
import test from "node:test";
import type { StatementPageData } from "../statements/statement-page-data";
import {
  buildLedgerStatementFinanceCloseProviderFragment,
  LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS,
  resolveConsolidationApplicability,
  type LedgerStatementCloseProviderDependencies,
} from "./ledger-statement-providers";
import { financeCloseReviewedWorkpaperSnapshot } from "./workpaper-event-snapshot";

const scope = { companyCode: "C01", year: 2026, month: 6 };
const hashedExternalEvidence = `external-sha256:${"a".repeat(64)}:https://evidence.example/close/report.pdf`;
const statementFacts: StatementPageData = {
  mode: "standalone",
  scope: { ...scope, companyName: "测试公司", periodKind: "month", batchId: null, batchStatus: null },
  statements: [
    { reportType: "balanceSheet", label: "资产负债表", source: "system", diagnostics: [], lines: [{ lineCode: "totalEquity", code: null, label: "权益", amount: 40, previousAmount: 30, section: "equity", side: "credit", direction: null, subtract: false, isHeader: false, isTotal: true, isGrandTotal: false }], totals: { totalAssets: 100, totalLiabilitiesAndEquity: 100 } },
    { reportType: "incomeStatement", label: "利润表", source: "system", diagnostics: [], lines: [{ lineCode: "profit", code: null, label: "利润", amount: 10, previousAmount: 8, section: "profit", side: "credit", direction: null, subtract: false, isHeader: false, isTotal: true, isGrandTotal: false }], totals: { profit: 10 } },
    { reportType: "cashFlow", label: "现金流量表", source: "system", diagnostics: [], lines: [{ lineCode: "endingCash", code: null, label: "期末现金", amount: 20, previousAmount: 15, section: "cash", side: "debit", direction: "net", subtract: false, isHeader: false, isTotal: true, isGrandTotal: false }], totals: { endingCash: 20 } },
  ],
};

function deps(overrides: Partial<LedgerStatementCloseProviderDependencies> = {}): LedgerStatementCloseProviderDependencies {
  return {
    loadWorkpaper: async () => null,
    loadWorkpaperVouchers: async (ids) => ids.map((id) => ({
      id, companyCode: "C01", status: "posted", period: { companyCode: "C01", year: 2026, month: 6 },
    })),
    loadWorkpaperVoucherItems: async (ids) => ids.map((id) => ({
      id,
      voucher: {
        companyCode: "C01", status: "posted", periodId: 2,
        period: { companyCode: "C01", year: 2026, month: 6 },
      },
    })),
    loadLatestReviewedWorkpaperEvent: async () => null,
    loadLedgerFacts: async () => ({ periodId: 2, balanceIds: [1], vouchers: [] }),
    loadRelatedPartyFacts: async () => ({ rows: [], complete: true, expectedTotal: 0 }),
    loadStandaloneFacts: async () => statementFacts,
    loadConsolidationFacts: async () => ({ applicability: "not_applicable", relationIds: [7], batch: null }),
    ...overrides,
  };
}

function reviewedWorkpaper(taskKey: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 1, companyId: 1, periodId: 2, taskKey, status: "reviewed", conclusion: "完成",
    evidenceRefs: [hashedExternalEvidence], voucherRefs: [], preparedByUserId: 7, reviewedByUserId: 8,
    version: 2, updatedAt: new Date("2026-06-30T00:00:00Z"), ...overrides,
  };
}

function reviewedEvent(workpaper: ReturnType<typeof reviewedWorkpaper>) {
  return {
    id: 11,
    workpaperId: workpaper.id,
    actorUserId: workpaper.reviewedByUserId as number,
    eventKind: "reviewed",
    toStatus: "reviewed",
    snapshot: financeCloseReviewedWorkpaperSnapshot(workpaper),
    recordedAt: new Date("2026-06-30T00:00:01Z"),
  };
}

function reviewedDeps(
  taskKey: string,
  dependencyOverrides: Partial<LedgerStatementCloseProviderDependencies> = {},
  workpaperOverrides: Record<string, unknown> = {},
) {
  const workpaper = reviewedWorkpaper(taskKey, workpaperOverrides);
  return deps({
    loadWorkpaper: async () => workpaper,
    loadLatestReviewedWorkpaperEvent: async () => reviewedEvent(workpaper),
    ...dependencyOverrides,
  });
}

test("every ledger and statement close task owns an independent contributor key", () => {
  const keys = Object.values(LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS);
  assert.equal(keys.length, 18);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(Object.keys(buildLedgerStatementFinanceCloseProviderFragment(deps())).length, keys.length);
});

test("subjective completeness is not ready until an independently reviewed workpaper exists", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["employee-reimbursements"];
  const missing = await buildLedgerStatementFinanceCloseProviderFragment(deps())[key]!.inspectPeriodClose(scope);
  assert.equal(missing.status, "pending");
  const reviewed = await buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps("employee-reimbursements"))[key]!.inspectPeriodClose(scope);
  assert.equal(reviewed.status, "ready");
});

test("reviewed workpapers fail closed when their independent audit trail is incomplete", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["employee-reimbursements"];
  const result = await buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps(
    "employee-reimbursements",
    {},
    { conclusion: " ", evidenceRefs: [], reviewedByUserId: 7 },
  ))[key]!.inspectPeriodClose(scope);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers[0]?.code, "workpaper_review_audit_incomplete");
});

test("voucher status, scope and removal change the workpaper fingerprint and block refresh", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["employee-reimbursements"];
  const workpaper = { conclusion: "已核对", evidenceRefs: [], voucherRefs: ["finance-voucher:42"] };
  const inspect = (loadWorkpaperVouchers: LedgerStatementCloseProviderDependencies["loadWorkpaperVouchers"]) => (
    buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps(
      "employee-reimbursements",
      { loadWorkpaperVouchers },
      workpaper,
    ))[key]!.inspectPeriodClose(scope)
  );
  const valid = await inspect(async () => [{
    id: 42, companyCode: "C01", status: "posted", period: { companyCode: "C01", year: 2026, month: 6 },
  }]);
  const voided = await inspect(async () => [{
    id: 42, companyCode: "C01", status: "voided", period: { companyCode: "C01", year: 2026, month: 6 },
  }]);
  const crossPeriod = await inspect(async () => [{
    id: 42, companyCode: "C01", status: "posted", period: { companyCode: "C01", year: 2026, month: 5 },
  }]);
  const missing = await inspect(async () => []);

  assert.equal(valid.status, "ready");
  for (const stale of [voided, crossPeriod, missing]) {
    assert.equal(stale.status, "blocked");
    assert.equal(stale.blockers.some((item) => item.code === "workpaper_voucher_refs_stale"), true);
    assert.notEqual(stale.inputFingerprint, valid.inputFingerprint);
  }
  assert.equal(new Set([voided.inputFingerprint, crossPeriod.inputFingerprint, missing.inputFingerprint]).size, 3);
  assert.deepEqual((missing.payload as { voucherInspection: unknown }).voucherInspection, {
    requestedIds: [42],
    decisions: [{
      id: 42, present: false, companyCode: null, companyMatches: false,
      status: null, period: null, periodMatches: false, valid: false,
    }],
    staleIds: [42],
  });
});

test("plain URLs remain supplemental even after independent review", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["employee-reimbursements"];
  const result = await buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps(
    "employee-reimbursements",
    {},
    { evidenceRefs: ["https://example.com/unhashed-report.pdf"] },
  ))[key]!.inspectPeriodClose(scope);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers.some((item) => item.code === "workpaper_governed_evidence_missing"), true);
});

test("voucher-item evidence is revalidated against the current company, period and posted voucher", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["employee-reimbursements"];
  const valid = await buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps(
    "employee-reimbursements",
    {},
    { evidenceRefs: ["finance-voucher-item:42"] },
  ))[key]!.inspectPeriodClose(scope);
  assert.equal(valid.status, "ready");

  const stale = await buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps(
    "employee-reimbursements",
    { loadWorkpaperVoucherItems: async () => [] },
    { evidenceRefs: ["finance-voucher-item:42"] },
  ))[key]!.inspectPeriodClose(scope);
  assert.equal(stale.status, "blocked");
  assert.equal(stale.blockers.some((item) => item.code === "workpaper_evidence_refs_stale"), true);
});

test("reviewed workpapers require the latest immutable event to match the current snapshot", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["employee-reimbursements"];
  const workpaper = reviewedWorkpaper("employee-reimbursements");
  const staleEvent = reviewedEvent({ ...workpaper, version: 1 });
  const result = await buildLedgerStatementFinanceCloseProviderFragment(deps({
    loadWorkpaper: async () => workpaper,
    loadLatestReviewedWorkpaperEvent: async () => staleEvent,
  }))[key]!.inspectPeriodClose(scope);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers.some((item) => item.code === "workpaper_review_event_stale"), true);
});

test("ledger inspection blocks header-to-line mismatch and links the exact task", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["fx-and-profit-closing"];
  const provider = buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps("fx-and-profit-closing", {
    loadLedgerFacts: async () => ({ periodId: 2, balanceIds: [1], vouchers: [{
      id: 9, voucherNo: "记-1", status: "posted", totalDebit: 100, totalCredit: 100,
      items: [{ debit: 90, credit: 90, account: { id: 1, isActive: true, companyCode: "C01", year: 2026 } }],
    }] }),
  }))[key]!;
  const result = await provider.inspectPeriodClose(scope);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers[0]?.deepLink.includes("taskKey=fx-and-profit-closing"), true);
});

test("ledger inspection treats an exact one-cent voucher difference as unbalanced", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["fx-and-profit-closing"];
  const provider = buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps("fx-and-profit-closing", {
    loadLedgerFacts: async () => ({
      periodId: 2,
      balanceIds: [1],
      vouchers: [
        {
          id: 9, voucherNo: "记-1", status: "posted", totalDebit: 10, totalCredit: 10.01,
          items: [{ debit: 10, credit: 10.01, account: { id: 1, isActive: true, companyCode: "C01", year: 2026 } }],
        },
        {
          id: 10, voucherNo: "记-2", status: "posted", totalDebit: 10.01, totalCredit: 10.01,
          items: [{ debit: 10, credit: 10, account: { id: 2, isActive: true, companyCode: "C01", year: 2026 } }],
        },
      ],
    }),
  }))[key]!;

  const result = await provider.inspectPeriodClose(scope);

  assert.equal(result.status, "blocked");
  assert.deepEqual((result.payload as { facts: { payload: { unbalancedVoucherIds: number[] } } }).facts.payload.unbalancedVoucherIds, [9, 10]);
  assert.equal(result.blockers.some((item) => item.code === "unbalanced_vouchers"), true);
});

test("standalone statement inspection treats 100.00 versus 99.99 as unbalanced", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["standalone-statements"];
  const unbalancedFacts: StatementPageData = {
    ...statementFacts,
    statements: statementFacts.statements.map((statement) => statement.reportType === "balanceSheet"
      ? { ...statement, totals: { ...statement.totals, totalAssets: 100, totalLiabilitiesAndEquity: 99.99 } }
      : statement),
  };
  const result = await buildLedgerStatementFinanceCloseProviderFragment(deps({
    loadStandaloneFacts: async () => unbalancedFacts,
  }))[key]!.inspectPeriodClose(scope);

  assert.equal(result.status, "blocked");
  assert.equal(result.blockers.some((item) => item.code === "balance_sheet_unbalanced"), true);
  assert.equal((result.payload as { balanceDifference: number }).balanceDifference, 0.01);
});

test("non-parent companies treat group statements as authoritative not-applicable", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["consolidated-statements"];
  const result = await buildLedgerStatementFinanceCloseProviderFragment(deps())[key]!.inspectPeriodClose(scope);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.evidenceRefs, ["ownership-interest:7"]);
});

test("consolidation applicability isolates independent group roots and their reachable evidence", () => {
  const relations = [
    { id: 1, parentId: 10, childId: 11 },
    { id: 2, parentId: 11, childId: 12 },
    { id: 3, parentId: 20, childId: 21 },
  ];
  assert.deepEqual(resolveConsolidationApplicability(10, relations), { required: true, relationIds: [1, 2] });
  assert.deepEqual(resolveConsolidationApplicability(20, relations), { required: true, relationIds: [3] });
  assert.deepEqual(resolveConsolidationApplicability(11, relations), { required: false, relationIds: [1] });
  assert.deepEqual(resolveConsolidationApplicability(99, relations), { required: false, relationIds: [] });
});

test("related-party reconciliation fails closed when paged facts are incomplete", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["related-party-reconciliation"];
  const result = await buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps("related-party-reconciliation", {
    loadRelatedPartyFacts: async () => ({ rows: [], complete: false, expectedTotal: 1 }),
  }))[key]!.inspectPeriodClose(scope);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers[0]?.code, "related_party_balance_incomplete");
});

test("ledger close identity is invariant to balance, voucher and item ordering", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["fx-and-profit-closing"];
  const facts = {
    periodId: 2,
    balanceIds: [2, 1],
    vouchers: [
      {
        id: 9, voucherNo: "记-9", status: "posted", totalDebit: 100, totalCredit: 100,
        items: [
          { debit: 0, credit: 100, account: { id: 2, isActive: true, companyCode: "C01", year: 2026 } },
          { debit: 100, credit: 0, account: { id: 1, isActive: true, companyCode: "C01", year: 2026 } },
        ],
      },
      {
        id: 8, voucherNo: "记-8", status: "draft", totalDebit: 20, totalCredit: 20,
        items: [
          { debit: 0, credit: 20, account: { id: 4, isActive: true, companyCode: "C01", year: 2026 } },
          { debit: 20, credit: 0, account: { id: 3, isActive: true, companyCode: "C01", year: 2026 } },
        ],
      },
    ],
  };
  const inspect = (value: typeof facts) => buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps(
    "fx-and-profit-closing",
    { loadLedgerFacts: async () => value },
  ))[key]!.inspectPeriodClose(scope);
  const original = await inspect(facts);
  const permuted = await inspect({
    ...facts,
    balanceIds: [...facts.balanceIds].reverse(),
    vouchers: [...facts.vouchers].reverse().map((voucher) => ({ ...voucher, items: [...voucher.items].reverse() })),
  });
  const changed = await inspect({
    ...facts,
    vouchers: facts.vouchers.map((voucher) => voucher.id === 9 ? { ...voucher, totalDebit: 101 } : voucher),
  });

  assert.deepEqual(permuted.payload, original.payload);
  assert.equal(permuted.inputFingerprint, original.inputFingerprint);
  assert.notEqual(changed.inputFingerprint, original.inputFingerprint);
});

test("consolidation close identity canonicalizes relations, entries and control decisions", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["group-accounting-adjustments"];
  const facts = {
    applicability: "parent_required" as const,
    relationIds: [8, 7],
    batch: {
      id: 20, status: "locked", revision: 3,
      entries: [
        { id: 22, entryNo: "合-2", status: "approved", entryType: "elimination" },
        { id: 21, entryNo: "合-1", status: "approved", entryType: "adjustment" },
      ],
      controlDecisions: [
        { controlKey: "z", decision: "include" },
        { controlKey: "a", decision: "exclude" },
      ],
      outputSnapshot: { outputFingerprint: "output-1" },
    },
  };
  const inspect = (value: typeof facts) => buildLedgerStatementFinanceCloseProviderFragment(deps({
    loadConsolidationFacts: async () => value,
  }))[key]!.inspectPeriodClose(scope);
  const original = await inspect(facts);
  const permuted = await inspect({
    ...facts,
    relationIds: [...facts.relationIds].reverse(),
    batch: {
      ...facts.batch,
      entries: [...facts.batch.entries].reverse(),
      controlDecisions: [...facts.batch.controlDecisions].reverse(),
    },
  });
  const changed = await inspect({
    ...facts,
    batch: {
      ...facts.batch,
      controlDecisions: facts.batch.controlDecisions.map((row) => row.controlKey === "a" ? { ...row, decision: "include" } : row),
    },
  });

  assert.deepEqual(permuted.payload, original.payload);
  assert.equal(permuted.inputFingerprint, original.inputFingerprint);
  assert.notEqual(changed.inputFingerprint, original.inputFingerprint);
});

test("related-party close identity canonicalizes rows and rejects duplicate page facts", async () => {
  const key = LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["related-party-reconciliation"];
  const rows = [
    { id: "2202:2", relatedPartyType: "group", closingDebit: 0, closingCredit: 20 },
    { id: "1122:1", relatedPartyType: "group", closingDebit: 10, closingCredit: 0 },
  ];
  const inspect = (value: typeof rows, complete = true) => buildLedgerStatementFinanceCloseProviderFragment(reviewedDeps(
    "related-party-reconciliation",
    { loadRelatedPartyFacts: async () => ({ rows: value, complete, expectedTotal: 2 }) },
  ))[key]!.inspectPeriodClose(scope);
  const original = await inspect(rows);
  const permuted = await inspect([...rows].reverse());
  const changed = await inspect(rows.map((row) => row.id === "1122:1" ? { ...row, closingDebit: 11 } : row));
  const duplicated = await inspect([rows[0]!, rows[0]!]);

  assert.deepEqual(permuted.payload, original.payload);
  assert.equal(permuted.inputFingerprint, original.inputFingerprint);
  assert.notEqual(changed.inputFingerprint, original.inputFingerprint);
  assert.equal(duplicated.status, "blocked");
  assert.equal(duplicated.blockers.some((item) => item.code === "related_party_balance_incomplete"), true);
});
