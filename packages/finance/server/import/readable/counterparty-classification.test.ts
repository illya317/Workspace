import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@workspace/platform/server/prisma";
import {
  classifyTPlusCounterparty,
  TPLUS_COUNTERPARTY_CLASSIFICATION_METHOD,
} from "../../domain/counterparty-classification-validation";
import { materializeTPlusCounterpartyClassifications } from "./counterparty-classification";
import type { NormalizedReadableBatch } from "./types";

test("classifies the historical TPlus generic partner slot by accounting semantics", () => {
  assert.equal(classifyTPlusCounterparty({ accountCode: "122101", accountName: "单位", rawDimensionType: "customer" }), "customer");
  assert.equal(classifyTPlusCounterparty({ accountCode: "1123", accountName: "预付账款", rawDimensionType: "customer" }), "supplier");
  assert.equal(classifyTPlusCounterparty({ accountCode: "2202", accountName: "应付账款", rawDimensionType: "customer" }), "supplier");
  assert.equal(classifyTPlusCounterparty({ accountCode: "224101", accountName: "单位", rawDimensionType: "customer" }), "supplier");
  assert.equal(classifyTPlusCounterparty({ accountCode: "224102", accountName: "个人", rawDimensionType: "customer" }), "person");
  assert.equal(classifyTPlusCounterparty({ accountCode: "9999", accountName: "其他", rawDimensionType: "supplier" }), "supplier");
});

test("materializes each TPlus member-account mapping once without rewriting raw links", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const tx = {
    financeVoucherItem: {
      findMany: async () => [{
        account: { id: 8, code: "2202", name: "应付账款" },
        auxiliaryLinks: [{ member: { id: 9, dimensionType: "customer" } }],
      }],
    },
    financeAuxiliaryBalance: { findMany: async () => [] },
    financeOpenItem: { findMany: async () => [] },
    financeCounterpartyClassification: {
      findMany: async () => [],
      createMany: async (args: Record<string, unknown>) => writes.push(args),
    },
  } as unknown as Prisma.TransactionClient;
  const batch = {
    spec: { sourceSystem: "TPLUS", mappingMode: "historical" },
  } as unknown as NormalizedReadableBatch;

  const created = await materializeTPlusCounterpartyClassifications(tx, batch, 4);

  assert.equal(created, 1);
  assert.deepEqual(writes, [{
    data: [{
      memberId: 9,
      accountId: 8,
      counterpartyType: "supplier",
      classificationMethod: TPLUS_COUNTERPARTY_CLASSIFICATION_METHOD,
      classificationEvidence: "account=2202 应付账款; rawDimension=customer",
    }],
    skipDuplicates: true,
  }]);
});

test("refuses to alter a locked TPlus classification", async () => {
  const tx = {
    financeVoucherItem: {
      findMany: async () => [{
        account: { id: 8, code: "2202", name: "应付账款" },
        auxiliaryLinks: [{ member: { id: 9, dimensionType: "customer" } }],
      }],
    },
    financeAuxiliaryBalance: { findMany: async () => [] },
    financeOpenItem: { findMany: async () => [] },
    financeCounterpartyClassification: {
      findMany: async () => [{
        memberId: 9,
        accountId: 8,
        counterpartyType: "customer",
        classificationMethod: TPLUS_COUNTERPARTY_CLASSIFICATION_METHOD,
        classificationEvidence: "account=2202 应付账款; rawDimension=customer",
      }],
      createMany: async () => assert.fail("locked mappings must not be rewritten"),
    },
  } as unknown as Prisma.TransactionClient;
  const batch = {
    spec: { sourceSystem: "TPLUS", mappingMode: "historical" },
  } as unknown as NormalizedReadableBatch;

  await assert.rejects(
    materializeTPlusCounterpartyClassifications(tx, batch, 4),
    /TPlus往来归类已锁定且与重算结果不一致/,
  );
});

test("does not create classifications for recurring T6 imports", async () => {
  const tx = new Proxy({}, { get: () => assert.fail("T6 must not query TPlus classification storage") });
  const batch = {
    spec: { sourceSystem: "T6", mappingMode: "recurring" },
  } as unknown as NormalizedReadableBatch;

  assert.equal(await materializeTPlusCounterpartyClassifications(tx as Prisma.TransactionClient, batch, 4), 0);
});
