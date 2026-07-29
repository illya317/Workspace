import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

type GuardInput = {
  entityType: string;
  modelKey: string;
  id: number;
  userId: number;
  deleteMode: string;
  expectedVersion: number;
  auditPolicy: string;
  referencePolicy: string;
  transactionIsolation: string;
  scopeGuard(context: { record: Record<string, unknown>; tx: object }): Promise<{ ok: true } | { error: string; status: number }>;
};

let groupCompanyCode = "GROUP";
let capturedGuard: GuardInput | null = null;
const policyRecord = { id: 51, companyCode: "SUB", year: 2026, categoryId: 7, version: 3 };

mock.module("@workspace/platform/server/prisma", {
  exports: {
    prisma: {
      financeAssetCategoryPolicy: {
        findUnique: async () => ({ id: policyRecord.id }),
      },
    },
  },
});

mock.module("../group-policy-scope", {
  exports: {
    resolveFinanceGroupPolicyCompany: async () => ({ id: 1, code: groupCompanyCode, name: "集团" }),
  },
});

mock.module("@workspace/platform/server/delete-guard", {
  exports: {
    guardedDelete: async (input: GuardInput) => {
      capturedGuard = input;
      const scope = await input.scopeGuard({ record: policyRecord, tx: {} });
      return "error" in scope
        ? { ok: false, error: scope.error, status: scope.status }
        : { ok: true, data: { success: true, id: input.id } };
    },
  },
});

const { deleteFinanceAssetCategoryPolicy } = await import("./asset-policy-service");

const command = {
  input: { companyCode: "SUB", year: 2026, categoryId: 7, version: 3 },
  userId: 9,
};

test("company asset-policy override uses the standard guarded hard-delete contract", async () => {
  groupCompanyCode = "GROUP";
  capturedGuard = null;
  assert.deepEqual(await deleteFinanceAssetCategoryPolicy(command), { deleted: true });
  assert.ok(capturedGuard);
  assert.deepEqual({
    entityType: capturedGuard.entityType,
    modelKey: capturedGuard.modelKey,
    id: capturedGuard.id,
    userId: capturedGuard.userId,
    deleteMode: capturedGuard.deleteMode,
    expectedVersion: capturedGuard.expectedVersion,
    auditPolicy: capturedGuard.auditPolicy,
    referencePolicy: capturedGuard.referencePolicy,
    transactionIsolation: capturedGuard.transactionIsolation,
  }, {
    entityType: "FinanceAssetCategoryPolicy",
    modelKey: "financeAssetCategoryPolicy",
    id: 51,
    userId: 9,
    deleteMode: "hard",
    expectedVersion: 3,
    auditPolicy: "none",
    referencePolicy: "none",
    transactionIsolation: "serializable",
  });
});

test("group asset policy remains protected inside the guarded-delete transaction", async () => {
  groupCompanyCode = "SUB";
  await assert.rejects(deleteFinanceAssetCategoryPolicy(command), /集团政策不能恢复为集团默认/u);
});
