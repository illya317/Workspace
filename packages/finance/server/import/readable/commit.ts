import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";
import { commitReadableCore } from "./commit-core";
import { materializeReadableBalances, replaceSourceBalances } from "./commit-balances";
import {
  replaceAuxiliaryBalances, replaceVoucherAuxiliaryLinks, upsertAuxiliaryMembers,
} from "./commit-dimensions";
import { replaceCashFlowAllocations, replaceOpenItems } from "./commit-cash-open";
import { upsertTreasuryFacts } from "./commit-treasury";
import { previewReadableBatch } from "./preview";
import type { NormalizedReadableBatch } from "./types";

export interface ReadableCommitResult {
  importId: number;
  companyCode: string;
  year: number;
  vouchers: number;
  items: number;
  warnings: string[];
}

export async function commitFinanceArchiveImport(batch: NormalizedReadableBatch): Promise<ReadableCommitResult> {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const preview = previewReadableBatch(batch);
  if (preview.difference !== 0) throw new Error(`Refusing unbalanced batch ${batch.spec.companyCode}-${batch.spec.year}`);
  const batchKey = `finance-readable:${batch.spec.sourceSystem}:${batch.spec.sourceDatabase}:${batch.spec.year}`;
  const controlJson = {
    accounts: preview.accountCount, vouchers: preview.voucherCount,
    postedVouchers: preview.postedVoucherCount, draftVouchers: preview.draftVoucherCount,
    items: preview.itemCount,
    debit: preview.debit, credit: preview.credit, sourceBalances: preview.sourceBalanceCount,
    auxiliaryBalances: preview.auxiliaryBalanceCount, cashFlowAllocations: preview.cashFlowAllocationCount,
    openItems: preview.openItemCount,
  } satisfies Prisma.InputJsonObject;
  const importBatch = await prisma.financeLedgerImport.upsert({
    where: { batchKey },
    create: {
      batchKey, type: "readable", companyCode: batch.spec.companyCode, year: batch.spec.year,
      sourceSystem: batch.spec.sourceSystem, sourceLedger: batch.spec.sourceLedger,
      sourceDatabase: batch.spec.sourceDatabase, sourcePath: batch.spec.sourceDatabase,
      snapshotDate: batch.snapshotDate, cutoffDate: batch.cutoffDate, controlJson,
      status: "running", rowCount: preview.itemCount,
    },
    update: {
      snapshotDate: batch.snapshotDate, cutoffDate: batch.cutoffDate, controlJson,
      status: "running", rowCount: preview.itemCount, warnings: null,
    },
  });
  try {
    await prisma.$transaction(async (tx) => {
      const core = await commitReadableCore(tx, batch, importBatch.id);
      const members = await upsertAuxiliaryMembers(tx, batch, importBatch.id);
      await replaceVoucherAuxiliaryLinks(tx, batch, core, members);
      await replaceSourceBalances(tx, batch, importBatch.id, core);
      await replaceAuxiliaryBalances(tx, batch, importBatch.id, core, members);
      await materializeReadableBalances(tx, batch, core);
      await replaceCashFlowAllocations(tx, batch, importBatch.id, core);
      await replaceOpenItems(tx, batch, importBatch.id, members);
      await upsertTreasuryFacts(tx, batch, importBatch.id, core);
      await tx.financeLedgerImport.update({
        where: { id: importBatch.id },
        data: {
          status: "completed", createdCount: preview.itemCount, updatedCount: preview.itemCount,
          blockedCount: 0, conflictCount: 0, warnings: JSON.stringify([...new Set(batch.warnings)]),
        },
      });
    }, { maxWait: 30_000, timeout: 300_000 });
  } catch (error) {
    await prisma.financeLedgerImport.update({
      where: { id: importBatch.id },
      data: { status: "failed", warnings: JSON.stringify([error instanceof Error ? error.message : String(error)]) },
    });
    throw error;
  }
  return {
    importId: importBatch.id, companyCode: batch.spec.companyCode, year: batch.spec.year,
    vouchers: preview.voucherCount, items: preview.itemCount, warnings: [...new Set(batch.warnings)],
  };
}
