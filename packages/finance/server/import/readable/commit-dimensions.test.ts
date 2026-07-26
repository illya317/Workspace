import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@workspace/platform/server/prisma";
import { replaceAuxiliaryBalances, upsertAuxiliaryMembers } from "./commit-dimensions";
import type { CoreCommitContext } from "./commit-core";
import type { NormalizedReadableBatch } from "./types";

test("refreshes auxiliary balances by source key without breaking consolidation source ids", async () => {
  const calls: Record<string, unknown>[] = [];
  const tx = {
    financeAuxiliaryBalance: {
      findMany: async () => [{ id: 42, sourceKey: "balance-1" }],
      upsert: async (args: Record<string, unknown>) => {
        calls.push({ kind: "upsert", args });
        return { id: 42 };
      },
      deleteMany: async (args: Record<string, unknown>) => calls.push({ kind: "delete", args }),
    },
    financeAuxiliaryBalanceMember: {
      deleteMany: async (args: Record<string, unknown>) => calls.push({ kind: "member-delete", args }),
      createMany: async (args: Record<string, unknown>) => calls.push({ kind: "member-create", args }),
    },
  } as unknown as Prisma.TransactionClient;
  const batch = {
    spec: {
      companyCode: "ZX02", companyName: "示例子公司甲", year: 2026,
      sourceSystem: "T6", sourceLedger: "007", sourceDatabase: "UFDATA_007_2026",
      mappingMode: "recurring", mappingStartYear: 2020,
    },
    auxiliaryBalances: [{
      sourceKey: "balance-1", month: 6, accountSourceKey: "account-1", accountCode: "122101",
      openingDebit: 0, openingCredit: 0, currentDebit: 100, currentCredit: 0,
      closingDebit: 100, closingCredit: 0,
      auxiliaryRefs: [{ dimensionType: "customer", sourceCode: "0019", sourceRole: "customer" }],
    }],
    warnings: [],
  } as unknown as NormalizedReadableBatch;
  const core = {
    periods: new Map([[6, 6]]), accounts: new Map([["account-1", 7]]),
  } as unknown as CoreCommitContext;

  await replaceAuxiliaryBalances(tx, batch, 9, core, new Map([["customer:0019", 11]]));

  assert.equal(calls.filter((call) => call.kind === "upsert").length, 1);
  assert.deepEqual(calls.find((call) => call.kind === "member-delete"), {
    kind: "member-delete", args: { where: { balanceId: 42 } },
  });
  assert.equal(calls.some((call) => call.kind === "delete"), false);
});

test("reuses a verified company link for the same ERP auxiliary legal name across ledgers", async () => {
  const writes: Record<string, unknown>[] = [];
  let findCall = 0;
  const tx = {
    financeAuxiliaryMember: {
      findMany: async () => {
        findCall += 1;
        return findCall === 1 ? [] : [{
          sourceName: "上海示例子公司甲生物医药有限公司",
          linkedCompanyId: 9,
          companyLinkMethod: "verified_source_name",
          companyLinkEvidence: "已核定法定名称",
        }];
      },
      create: async (args: Record<string, unknown>) => {
        writes.push(args);
        return { id: 81 };
      },
    },
    company: { findMany: async () => [] },
  } as unknown as Prisma.TransactionClient;
  const batch = {
    spec: {
      companyCode: "ZX03", companyName: "示例子公司乙", year: 2020,
      sourceSystem: "TPLUS", sourceLedger: "003", sourceDatabase: "UFTData123456_003_2020",
      mappingMode: "historical", mappingStartYear: 2019, mappingEndYear: 2025,
      continuationOf: "T6/014",
    },
    auxiliaryMembers: [{
      dimensionType: "customer", sourceCode: "0060002",
      sourceName: "上海示例子公司甲生物医药有限公司",
    }],
  } as unknown as NormalizedReadableBatch;

  const ids = await upsertAuxiliaryMembers(tx, batch, 4);

  assert.equal(ids.get("customer:0060002"), 81);
  assert.deepEqual((writes[0]?.data as Record<string, unknown>), {
    companyCode: "ZX03", sourceSystem: "TPLUS", sourceLedger: "003",
    dimensionType: "customer", sourceCode: "0060002",
    sourceName: "上海示例子公司甲生物医药有限公司", shortName: null,
    identityNumber: null, contactPerson: null, phone: null, address: null,
    bankName: null, bankAccount: null, latestImportId: 4, firstYear: 2020, lastYear: 2020,
    linkedCompanyId: 9, companyLinkMethod: "verified_source_name",
    companyLinkEvidence: "已核定法定名称",
  });
});
