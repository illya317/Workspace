import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@workspace/platform/server/prisma";
import { markLegacyVouchersOutsideSourceInvalid, upsertVouchers } from "./commit-core";
import type { NormalizedReadableBatch } from "./types";

function spec(overrides: Partial<NormalizedReadableBatch["spec"]> = {}): NormalizedReadableBatch["spec"] {
  return {
    companyCode: "ZX01",
    companyName: "示例集团有限公司",
    year: 2026,
    sourceSystem: "T6",
    sourceLedger: "001",
    sourceDatabase: "UFDATA_001_2026",
    mappingMode: "recurring",
    mappingStartYear: 2016,
    ...overrides,
  };
}

test("archives stale legacy vouchers so historical consolidation references stay intact", async () => {
  let update: unknown;
  const tx = {
    financeVoucher: {
      findMany: async () => [{ id: 11 }, { id: 12 }],
      updateMany: async (args: unknown) => { update = args; },
    },
  } as unknown as Prisma.TransactionClient;
  const batch = {
    spec: spec({
      companyCode: "ZX02",
      companyName: "上海示例子公司甲生物医药有限公司",
      sourceLedger: "002",
      sourceDatabase: "UFDATA_002_2026",
      mappingStartYear: 2020,
    }),
  } as unknown as NormalizedReadableBatch;

  await markLegacyVouchersOutsideSourceInvalid(tx, batch, new Map([[6, 60]]), new Map([["source", 11]]));

  assert.deepEqual(update, {
    where: { id: { in: [12] } },
    data: { status: "archived", sourceInvalid: true },
  });
});

test("updates an existing source voucher when repaired Chinese changes its display number", async () => {
  const updates: unknown[] = [];
  const tx = {
    financeVoucher: {
      findUnique: async (args: { where: Record<string, unknown> }) => (
        "sourceSystem_sourceDatabase_sourceKey" in args.where ? { id: 21 } : null
      ),
      update: async (args: unknown) => {
        updates.push(args);
        return { id: 21 };
      },
      create: async () => { throw new Error("must preserve the source voucher id"); },
    },
  } as unknown as Prisma.TransactionClient;
  const batch = {
    spec: spec(),
    vouchers: [{
      sourceKey: "6:1:1", voucherNo: "2026-06-记-0001", month: 6,
      date: "2026-06-30", description: "结转", totalDebit: 100, totalCredit: 100,
      status: "posted", isAdjustment: false, sourcePosted: true, sourceAudited: true,
      sourceInvalid: false, attachmentCount: 0, items: [],
    }],
  } as unknown as NormalizedReadableBatch;

  const result = await upsertVouchers(tx, batch, 8, new Map([[6, 60]]));

  assert.equal(result.get("6:1:1"), 21);
  assert.deepEqual((updates[0] as { where: unknown }).where, { id: 21 });
  assert.equal((updates[0] as { data: { voucherNo: string } }).data.voucherNo, "2026-06-记-0001");
});
