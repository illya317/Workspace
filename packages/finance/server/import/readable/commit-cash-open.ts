import type { Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";
import type { CoreCommitContext } from "./commit-core";
import type { NormalizedReadableBatch } from "./types";

function memberKey(dimensionType: string, sourceCode: string) {
  return `${dimensionType}:${sourceCode}`;
}

async function upsertCashFlowItems(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
) {
  const existing = await tx.financeCashFlowItem.findMany({
    where: {
      companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
      sourceLedger: batch.spec.sourceLedger,
    },
  });
  const byCode = new Map(existing.map((item) => [item.sourceCode, item]));
  const result = new Map<string, number>();
  for (const item of batch.cashFlowItems) {
    const found = byCode.get(item.sourceCode);
    const data = {
      sourceName: item.sourceName, direction: item.direction ?? null, latestImportId: importId,
      firstYear: Math.min(found?.firstYear ?? batch.spec.year, batch.spec.year),
      lastYear: Math.max(found?.lastYear ?? batch.spec.year, batch.spec.year),
    };
    const record = found
      ? await tx.financeCashFlowItem.update({ where: { id: found.id }, data })
      : await tx.financeCashFlowItem.create({
        data: {
          companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
          sourceLedger: batch.spec.sourceLedger, sourceCode: item.sourceCode, ...data,
        },
      });
    result.set(item.sourceCode, record.id);
  }
  return result;
}

export async function replaceCashFlowAllocations(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  core: CoreCommitContext,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  await tx.financeCashFlowAllocation.deleteMany({ where: { importId } });
  const cashItems = await upsertCashFlowItems(tx, batch, importId);
  const rows = batch.cashFlowAllocations.flatMap((item) => {
    const periodId = core.periods.get(item.month);
    const voucherId = core.vouchers.get(item.voucherSourceKey);
    const cashFlowItemId = cashItems.get(item.cashFlowCode);
    if (!periodId || !voucherId || !cashFlowItemId) {
      batch.warnings.push(`现金流分配未映射：${item.sourceKey}/${item.cashFlowCode}`);
      return [];
    }
    return [{
      importId, companyCode: batch.spec.companyCode, periodId, voucherId, cashFlowItemId,
      ownerVoucherItemId: item.ownerSortOrder === undefined
        ? null : core.itemsByVoucherSort.get(`${item.voucherSourceKey}:${item.ownerSortOrder}`) ?? null,
      counterpartItemId: item.counterpartSortOrder === undefined
        ? null : core.itemsByVoucherSort.get(`${item.voucherSourceKey}:${item.counterpartSortOrder}`) ?? null,
      sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
      sourceKey: item.sourceKey, direction: item.direction, amount: item.amount,
    }];
  });
  if (rows.length) await tx.financeCashFlowAllocation.createMany({ data: rows });
}

export async function replaceOpenItems(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  members: Map<string, number>,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  await tx.financeOpenItem.deleteMany({ where: { importId } });
  if (!batch.openItems.length) return;
  const accountKeys = batch.openItems.flatMap((item) => item.accountSourceKey ? [item.accountSourceKey] : []);
  const itemKeys = batch.openItems.flatMap((item) => item.voucherItemSourceKey ? [item.voucherItemSourceKey] : []);
  const [accounts, voucherItems] = await Promise.all([
    tx.financeAccount.findMany({
      where: {
        companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
        sourceDatabase: batch.spec.sourceDatabase, sourceKey: { in: accountKeys },
      }, select: { id: true, sourceKey: true },
    }),
    tx.financeVoucherItem.findMany({
      where: {
        sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: { in: itemKeys },
      }, select: { id: true, sourceKey: true },
    }),
  ]);
  const accountIds = new Map(accounts.flatMap((item) => item.sourceKey ? [[item.sourceKey, item.id] as const] : []));
  const itemIds = new Map(voucherItems.flatMap((item) => item.sourceKey ? [[item.sourceKey, item.id] as const] : []));
  for (const item of batch.openItems) {
    const record = await tx.financeOpenItem.create({
      data: {
        importId, companyCode: batch.spec.companyCode,
        accountId: item.accountSourceKey ? accountIds.get(item.accountSourceKey) ?? null : null,
        voucherItemId: item.voucherItemSourceKey ? itemIds.get(item.voucherItemSourceKey) ?? null : null,
        sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: item.sourceKey, documentNo: item.documentNo ?? null,
        documentDate: item.documentDate ?? null, dueDate: item.dueDate ?? null, memo: item.memo ?? null,
        currencyCode: item.currencyCode ?? null, originalDebit: item.originalDebit,
        originalCredit: item.originalCredit, outstandingDebit: item.outstandingDebit,
        outstandingCredit: item.outstandingCredit, status: item.status,
      },
    });
    const links = item.auxiliaryRefs.flatMap((ref) => {
      const memberId = members.get(memberKey(ref.dimensionType, ref.sourceCode));
      return memberId ? [{ openItemId: record.id, memberId, sourceRole: ref.sourceRole }] : [];
    });
    if (links.length) await tx.financeOpenItemAuxiliary.createMany({ data: links, skipDuplicates: true });
  }
}
