import assert from "node:assert/strict";
import test from "node:test";

import { resolveFinanceCompanyAccountsFromGroupPolicyWithClient } from "./company-account-resolver";

function clientFor(targetCodes: string[]) {
  const sourceAccount = {
    id: 101,
    code: "1601",
    companyCode: "01",
    sourceSystem: null,
    sourceDatabase: null,
    sourceLedger: null,
  };
  const targetAccounts = targetCodes.map((code, index) => ({
    id: 201 + index,
    code,
    name: `目标科目${index + 1}`,
    category: "asset",
    companyCode: "02",
    year: 2026,
    isActive: true,
    sourceSystem: null,
    sourceDatabase: null,
    sourceLedger: null,
  }));
  return {
    financeAccountingPolicyVersion: { findMany: async () => [{ id: 9, versionNo: 1 }] },
    financeAccount: {
      findMany: async ({ where }: { where: { id?: unknown } }) => where.id ? [sourceAccount] : targetAccounts,
    },
    financeGroupAccountMapping: {
      findMany: async ({ where }: { where: { companyCode: string | { in: string[] } } }) => typeof where.companyCode === "string"
        ? targetCodes.map((code) => ({ companyCode: "02", sourceScopeKey: "workspace::default", localAccountCode: code, groupAccountId: 501 }))
        : [{ companyCode: "01", sourceScopeKey: "workspace::default", localAccountCode: "1601", groupAccountId: 501 }],
    },
    financeGroupAccountRevision: { findMany: async () => [{ groupAccountId: 501 }] },
  };
}

test("projects a group policy account through the existing mapping into one company account", async () => {
  const result = await resolveFinanceCompanyAccountsFromGroupPolicyWithClient(clientFor(["FA-LOCAL"]) as never, {
    sourceAccountIds: [101],
    targetCompanyCode: "02",
    fiscalYear: 2026,
    effectiveAt: "2026-12-31",
  });
  assert.equal(result.policyVersionId, 9);
  assert.deepEqual(result.resolutions[0], {
    sourceAccountId: 101,
    groupAccountId: 501,
    targetAccount: { id: 201, code: "FA-LOCAL", name: "目标科目1", category: "asset", companyCode: "02", year: 2026, isActive: true },
    status: "mapped",
  });
});

test("fails closed when one group account maps to multiple target company accounts", async () => {
  const result = await resolveFinanceCompanyAccountsFromGroupPolicyWithClient(clientFor(["FA-A", "FA-B"]) as never, {
    sourceAccountIds: [101],
    targetCompanyCode: "02",
    fiscalYear: 2026,
    effectiveAt: "2026-12-31",
  });
  assert.equal(result.resolutions[0]?.status, "target_ambiguous");
  assert.equal(result.resolutions[0]?.targetAccount, null);
});
