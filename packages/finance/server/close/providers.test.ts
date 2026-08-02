import assert from "node:assert/strict";
import test from "node:test";
import type { TaxWorkspaceDto } from "../../types/tax";
import { FINANCE_CLOSE_TASK_CATALOG } from "./catalog";
import { buildDefaultFinanceCloseProviderRegistry, inspectTaxAccrualWorkspace } from "./default-providers";
import { buildInventoryCloseProviders } from "./inventory-providers";
import { buildFinanceCloseProviderRegistry, inspectFinanceCloseContributors, planFinanceCloseRefresh } from "./providers";

const closeScope = { companyCode: "C02", year: 2026, month: 6 };

test("default close registry covers all 27 independent contributors", () => {
  const registry = buildDefaultFinanceCloseProviderRegistry();
  const catalogKeys = FINANCE_CLOSE_TASK_CATALOG.map((item) => item.contributorKey).sort();
  assert.equal(registry.size, 27);
  assert.deepEqual([...registry.keys()].sort(), catalogKeys);
});

test("default close registry fails both inventory tasks closed when app composition omits the contract", async () => {
  const inspections = await inspectFinanceCloseContributors(closeScope, buildDefaultFinanceCloseProviderRegistry());
  for (const contributorKey of ["inventory.operations.records", "inventory.operations.count-differences"]) {
    const inspection = inspections.get(contributorKey)!;
    assert.equal(inspection.status, "unavailable");
    assert.equal(inspection.blockers[0]?.code, "provider_unavailable");
  }
});

test("default close registry uses the inventory contract injected by the app composition root", async () => {
  const calls: string[] = [];
  const registry = buildDefaultFinanceCloseProviderRegistry({
    inspectPeriodRecords: async () => {
      calls.push("records");
      return {
        status: "ready", inspectionVersion: "inventory-records-injected-v1", blockers: [], evidenceRefs: [], voucherRefs: [],
        deepLink: "/inventory/operations?view=closing", payload: { kind: "records" },
      };
    },
    inspectPeriodCountDifferences: async () => {
      calls.push("count_differences");
      return {
        status: "pending", inspectionVersion: "inventory-count-injected-v1", blockers: [], evidenceRefs: [], voucherRefs: [],
        deepLink: "/inventory/operations?view=stocktakes", payload: { kind: "count_differences" },
      };
    },
  });
  const inspections = await inspectFinanceCloseContributors(closeScope, registry);
  assert.equal(inspections.get("inventory.operations.records")?.status, "ready");
  assert.equal(inspections.get("inventory.operations.count-differences")?.status, "pending");
  assert.deepEqual(calls, ["records", "count_differences"]);
});

test("inventory record and count-difference tasks keep independent inspections", async () => {
  const registry = buildFinanceCloseProviderRegistry(buildInventoryCloseProviders({
    inspectPeriodRecords: async () => ({
      status: "ready", inspectionVersion: "inventory-records-test-v1", blockers: [], evidenceRefs: ["inventory-document:1"], voucherRefs: [], deepLink: "/inventory/operations?view=closing", payload: { kind: "records" },
    }),
    inspectPeriodCountDifferences: async () => ({
      status: "pending", inspectionVersion: "inventory-count-test-v1", blockers: [], evidenceRefs: ["inventory-stocktake:2"], voucherRefs: [], deepLink: "/inventory/operations?view=stocktakes", payload: { kind: "count_differences" },
    }),
  }));
  const plan = planFinanceCloseRefresh(await inspectFinanceCloseContributors(closeScope, registry));
  const records = plan.find((item) => item.taskKey === "inventory-records")!;
  const differences = plan.find((item) => item.taskKey === "inventory-count-differences")!;
  assert.equal(records.inspection.status, "ready");
  assert.deepEqual(records.inspection.payload, { kind: "records" });
  assert.equal(differences.inspection.status, "pending");
  assert.deepEqual(differences.inspection.payload, { kind: "count_differences" });
  assert.notEqual(records.payloadSha256, differences.payloadSha256);
});

test("inventory RPC failures are isolated and materialized unavailable by the close aggregator", async () => {
  const registry = buildFinanceCloseProviderRegistry(buildInventoryCloseProviders({
    inspectPeriodRecords: async () => { throw new Error("inventory rpc offline"); },
    inspectPeriodCountDifferences: async () => { throw new Error("inventory rpc offline"); },
  }));
  const inspections = await inspectFinanceCloseContributors(closeScope, registry);
  for (const contributorKey of ["inventory.operations.records", "inventory.operations.count-differences"]) {
    const inspection = inspections.get(contributorKey)!;
    assert.equal(inspection.status, "unavailable");
    assert.equal(inspection.blockers[0]?.code, "provider_unavailable");
    assert.doesNotMatch(JSON.stringify(inspection), /rpc offline/i);
  }
});

test("refresh planning inspects contributors once and materializes failures without losing tasks", async () => {
  let ledgerCalls = 0;
  const registry = buildFinanceCloseProviderRegistry({
    "finance.ledger.employee-reimbursements": { inspectPeriodClose: async () => {
      ledgerCalls += 1;
      return { status: "pending", contributorVersion: "test-v1", inputFingerprint: "ledger-1", blockers: [], evidenceRefs: [], voucherRefs: [], deepLink: "/finance/ledger", payload: { count: 1 } };
    } },
    "finance.assets.movements": { inspectPeriodClose: async () => { throw new Error("adapter failed"); } },
  });
  const inspections = await inspectFinanceCloseContributors(closeScope, registry);
  const plan = planFinanceCloseRefresh(inspections);
  assert.equal(ledgerCalls, 1);
  assert.equal(plan.length, 27);
  assert.equal(plan.filter((item) => item.inspection.status === "unavailable").length, 26);
  assert.equal(plan.filter((item) => item.inspection.blockers.some((blocker) => blocker.code === "provider_not_registered")).length, 25);
  assert.equal(new Set(plan.map((item) => item.taskKey)).size, FINANCE_CLOSE_TASK_CATALOG.length);
  const ledger = plan.find((item) => item.taskKey === "employee-reimbursements")!;
  assert.match(ledger.payloadSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.every((item) => item.inspection.inputFingerprint === item.payloadSha256), true);
});

test("malformed provider output fails closed without leaking its error", async () => {
  const registry = buildFinanceCloseProviderRegistry({
    "finance.ledger.employee-reimbursements": {
      inspectPeriodClose: async () => ({
        status: "surprise", contributorVersion: "test-v1", inputFingerprint: "ledger-1",
        blockers: [], evidenceRefs: [42], voucherRefs: [], deepLink: "/finance/ledger", payload: {},
      } as never),
    },
  });
  const inspections = await inspectFinanceCloseContributors(closeScope, registry);
  const result = inspections.get("finance.ledger.employee-reimbursements")!;
  assert.equal(result.status, "unavailable");
  assert.equal(result.blockers[0]?.code, "provider_unavailable");
  assert.doesNotMatch(JSON.stringify(result), /surprise|42|invalid inspection/i);
});

test("contradictory provider statuses fail closed", async () => {
  const readyWithBlocker = buildFinanceCloseProviderRegistry({
    "finance.ledger.employee-reimbursements": {
      inspectPeriodClose: async () => ({
        status: "ready", contributorVersion: "test-v1", inputFingerprint: "ledger-ready",
        blockers: [{ code: "still_blocked", message: "仍有阻断", deepLink: "/finance/ledger" }],
        evidenceRefs: [], voucherRefs: [], deepLink: "/finance/ledger", payload: {},
      }),
    },
  });
  const blockedWithoutBlocker = buildFinanceCloseProviderRegistry({
    "finance.ledger.payroll-accruals": {
      inspectPeriodClose: async () => ({
        status: "blocked", contributorVersion: "test-v1", inputFingerprint: "ledger-blocked",
        blockers: [], evidenceRefs: [], voucherRefs: [], deepLink: "/finance/ledger", payload: {},
      }),
    },
  });
  assert.equal((await inspectFinanceCloseContributors(closeScope, readyWithBlocker)).get("finance.ledger.employee-reimbursements")?.status, "unavailable");
  assert.equal((await inspectFinanceCloseContributors(closeScope, blockedWithoutBlocker)).get("finance.ledger.payroll-accruals")?.status, "unavailable");
});

const taxScope = { companyCode: "C02", year: 2026, month: 6 };

function taxWorkspace(overrides: Partial<TaxWorkspaceDto> = {}): TaxWorkspaceDto {
  return {
    scope: { ...taxScope, periodId: 6, isClosed: false },
    taxTypes: [],
    registrations: [{ id: 8, status: "active", effectiveFrom: "2026-06-30T00:00:00.000Z", effectiveThrough: null }],
    workpapers: [{
      id: 20, registrationId: 8, status: "reconciled", calculatedAmount: 0,
      sourceReportedAmount: 0, sourceDifference: 0,
      accrualLines: [{ id: 21, calculatedAmount: 0, sourceReportedAmount: 0, sourceDifference: 0, voucherItemId: null }],
    }],
    filings: [{
      id: 30, registrationId: 8, status: "accepted",
      reconciliation: {
        calculatedAmount: 0, declaredAmount: 0, payableAmount: 0, paidAmount: 0,
        filingEvidenceComplete: true, paymentEvidenceComplete: true, effectivePaymentIds: [],
        calculatedToDeclaredDifference: 0, declaredToPayableDifference: 0, payableToPaidDifference: 0,
      },
    }],
    payments: [],
    reconciliationSnapshots: [],
    blockers: [],
    evidenceRefs: [],
    ...overrides,
  };
}

test("tax close stays pending without filing/payment evidence and accepts an explicit zero filing", () => {
  const missingFiling = inspectTaxAccrualWorkspace(taxScope, taxWorkspace({ filings: [] }));
  assert.equal(missingFiling.status, "pending");

  const zeroWithoutEvidence = inspectTaxAccrualWorkspace(taxScope, taxWorkspace({
    filings: [{
      id: 30, registrationId: 8, status: "accepted",
      reconciliation: {
        calculatedAmount: 0, declaredAmount: 0, payableAmount: 0, paidAmount: 0,
        filingEvidenceComplete: false, paymentEvidenceComplete: true, effectivePaymentIds: [],
        calculatedToDeclaredDifference: 0, declaredToPayableDifference: 0, payableToPaidDifference: 0,
      },
    }],
  }));
  assert.equal(zeroWithoutEvidence.status, "pending");

  const explicitZero = inspectTaxAccrualWorkspace(taxScope, taxWorkspace());
  assert.equal(explicitZero.status, "ready");
});

test("tax close includes a historical ended registration when its dated interval covers the period", () => {
  const inspection = inspectTaxAccrualWorkspace(taxScope, taxWorkspace({
    registrations: [{ id: 8, status: "ended", effectiveFrom: "2025-01-01", effectiveThrough: "2026-06-30" }],
  }));
  assert.equal(inspection.status, "ready");
  assert.deepEqual((inspection.payload as { periodRegistrationIds: number[] }).periodRegistrationIds, [8]);
});

test("tax close blocks a suspended registration whose suspension period cannot be proven", () => {
  const inspection = inspectTaxAccrualWorkspace(taxScope, taxWorkspace({
    registrations: [{ id: 8, status: "suspended", effectiveFrom: "2025-01-01", effectiveThrough: null }],
    blockers: [{
      code: "registration_suspended_scope_unproven", message: "suspension date missing",
      entityKind: "registration", entityId: 8, deepLink: "/finance/tax",
    }],
  }));
  assert.equal(inspection.status, "blocked");
  assert.equal(inspection.blockers[0]?.code, "registration_suspended_scope_unproven");
});

test("refresh identity changes with blocker decisions even when provider payload is unchanged", async () => {
  const plannedTax = async (message: string) => {
    const inspection = inspectTaxAccrualWorkspace(taxScope, taxWorkspace({
      blockers: [{
        code: "registration_suspended_scope_unproven", message,
        entityKind: "registration", entityId: 8, deepLink: "/finance/tax",
      }],
    }));
    const registry = buildFinanceCloseProviderRegistry({
      "finance.tax.accrual": { inspectPeriodClose: async () => inspection },
    });
    const planned = planFinanceCloseRefresh(await inspectFinanceCloseContributors(taxScope, registry))
      .find((item) => item.taskKey === "tax-accruals")!;
    return { inspection, planned };
  };
  const first = await plannedTax("suspension date missing");
  const changed = await plannedTax("suspension period is outside the allowed scope");

  assert.deepEqual(first.inspection.payload, changed.inspection.payload);
  assert.notEqual(first.inspection.inputFingerprint, changed.inspection.inputFingerprint);
  assert.notEqual(first.planned.inspection.inputFingerprint, changed.planned.inspection.inputFingerprint);
  assert.equal(first.planned.inspection.inputFingerprint, first.planned.payloadSha256);
  assert.equal(changed.planned.inspection.inputFingerprint, changed.planned.payloadSha256);
});

test("tax close requires nonzero payment evidence and ignores blockers for registrations outside the period", () => {
  const workspace = taxWorkspace({
    registrations: [
      { id: 8, status: "active", effectiveFrom: "2026-01-01", effectiveThrough: null },
      { id: 9, status: "active", effectiveFrom: "2026-07-01", effectiveThrough: null },
      { id: 10, status: "ended", effectiveFrom: "2025-01-01", effectiveThrough: "2026-05-31" },
    ],
    workpapers: [{
      id: 20, registrationId: 8, status: "reconciled", calculatedAmount: 60,
      sourceReportedAmount: 60, sourceDifference: 0,
      accrualLines: [{ id: 21, calculatedAmount: 60, sourceReportedAmount: 60, sourceDifference: 0, voucherItemId: 101 }],
    }],
    filings: [{
      id: 30, registrationId: 8, status: "accepted",
      reconciliation: {
        calculatedAmount: 60, declaredAmount: 60, payableAmount: 60, paidAmount: 60,
        filingEvidenceComplete: true, paymentEvidenceComplete: true, effectivePaymentIds: [40],
        calculatedToDeclaredDifference: 0, declaredToPayableDifference: 0, payableToPaidDifference: 0,
      },
    }],
    payments: [{ id: 40, allocations: [{ voucherItemId: 102 }] }],
    blockers: [{ code: "missing_workpaper", message: "future registration", entityKind: "registration", entityId: 9, deepLink: "/finance/tax" }],
  });
  const inspection = inspectTaxAccrualWorkspace(taxScope, workspace);
  assert.equal(inspection.status, "ready");
  assert.deepEqual(inspection.evidenceRefs, ["finance-tax-filing:30", "finance-tax-payment:40", "finance-tax-workpaper:20"]);
  assert.deepEqual(inspection.voucherRefs, ["finance-voucher-item:101", "finance-voucher-item:102"]);

  const missingPaymentEvidence = inspectTaxAccrualWorkspace(taxScope, {
    ...workspace,
    filings: workspace.filings.map((filing) => ({
      ...filing,
      reconciliation: { ...(filing.reconciliation as Record<string, unknown>), paymentEvidenceComplete: false },
    })),
  });
  assert.equal(missingPaymentEvidence.status, "pending");
});
