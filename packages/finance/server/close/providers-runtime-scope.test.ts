import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceCloseScope } from "../../types/close";
import { buildFinanceCloseProviderRegistry, inspectFinanceCloseContributors } from "./providers";

test("provider inspection receives only the public company and period scope", async () => {
  let received: FinanceCloseScope | null = null;
  const registry = buildFinanceCloseProviderRegistry({
    "finance.ledger.employee-reimbursements": {
      inspectPeriodClose: async (scope) => {
        received = scope;
        return {
          status: "pending",
          contributorVersion: "test-v1",
          inputFingerprint: "test",
          blockers: [],
          evidenceRefs: [],
          voucherRefs: [],
          deepLink: "/finance/ledger",
          payload: {},
        };
      },
    },
  });

  await inspectFinanceCloseContributors({
    companyCode: "01",
    year: 2026,
    month: 6,
    runId: 1,
    expectedVersion: 2,
  } as FinanceCloseScope & { runId: number; expectedVersion: number }, registry);

  assert.deepEqual(received, { companyCode: "01", year: 2026, month: 6 });
});
