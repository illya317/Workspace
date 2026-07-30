import type { Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";
import { resolveSourcePeriodClosed } from "./period-close";
import type { NormalizedReadableBatch } from "./types";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

export interface CoreCommitContext {
  periods: Map<number, number>;
  accounts: Map<string, number>;
  vouchers: Map<string, number>;
  items: Map<string, number>;
  itemsByVoucherSort: Map<string, number>;
  itemIds: number[];
}

function periodDates(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { startDate, endDate };
}

async function upsertPeriods(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
): Promise<Map<number, number>> {
  const periods = new Map<number, number>();
  for (let month = 1; month <= 12; month += 1) {
    const sourceStatus = batch.periodStatuses.find((item) => item.month === month);
    const dates = sourceStatus?.startDate && sourceStatus.endDate
      ? { startDate: sourceStatus.startDate, endDate: sourceStatus.endDate }
      : periodDates(batch.spec.year, month);
    const sourceClosed = resolveSourcePeriodClosed(batch.spec.sourceSystem, sourceStatus);
    const record = await tx.financePeriod.upsert({
      where: { companyCode_year_month: { companyCode: batch.spec.companyCode, year: batch.spec.year, month } },
      create: {
        companyCode: batch.spec.companyCode, year: batch.spec.year, month, ...dates,
        isClosed: sourceClosed === true, sourceClosed,
        sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: `${batch.spec.sourceDatabase}:${month}`,
      },
      update: {
        ...dates, isClosed: sourceClosed === true, sourceClosed,
        sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: `${batch.spec.sourceDatabase}:${month}`,
      },
    });
    periods.set(month, record.id);
  }
  return periods;
}

async function groupSubjectMap(tx: Prisma.TransactionClient, batch: NormalizedReadableBatch) {
  const referenceCompanyCode = getTenantProfile().finance.referenceCompanyCode;
  if (batch.spec.companyCode === referenceCompanyCode) return { codes: new Map<string, string>(), names: new Map<string, string>() };
  const rows = await tx.financeAccount.findMany({
    where: { companyCode: referenceCompanyCode, year: batch.spec.year }, select: { code: true, name: true },
  });
  return {
    codes: new Map(rows.map((item) => [item.code, item.code])),
    names: new Map(rows.map((item) => [item.name, item.code])),
  };
}

async function upsertAccounts(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const sourceToCode = new Map(batch.accounts.map((item) => [item.sourceKey, item.code]));
  const group = await groupSubjectMap(tx, batch);
  const referenceCompanyCode = getTenantProfile().finance.referenceCompanyCode;
  const sorted = [...batch.accounts].sort((left, right) => (left.subjectLevel ?? left.code.length) - (right.subjectLevel ?? right.code.length));
  for (const item of sorted) {
    const parentId = item.parentSourceKey ? result.get(item.parentSourceKey) ?? null : null;
    const groupSubjectCode = batch.spec.companyCode === referenceCompanyCode
      ? item.code
      : group.codes.get(item.code) ?? group.names.get(item.name) ?? null;
    const data = {
      name: item.name, category: item.category, balanceDirection: item.balanceDirection,
      parentId, isActive: item.isActive, companyCode: batch.spec.companyCode,
      mnemonicCode: item.mnemonicCode ?? null, currency: item.currency ?? null,
      groupSubjectCode, subjectLevel: item.subjectLevel ?? null, year: batch.spec.year,
      sourceSystem: batch.spec.sourceSystem, sourceLedger: batch.spec.sourceLedger,
      sourceDatabase: batch.spec.sourceDatabase, sourceKey: item.sourceKey,
    };
    const record = await tx.financeAccount.upsert({
      where: { code_companyCode_year: { code: item.code, companyCode: batch.spec.companyCode, year: batch.spec.year } },
      create: { code: item.code, ...data }, update: data,
    });
    result.set(item.sourceKey, record.id);
    if (item.parentSourceKey && !sourceToCode.has(item.parentSourceKey)) {
      batch.warnings.push(`科目 ${item.code} 的来源父级 ${item.parentSourceKey} 不在本年度科目表`);
    }
  }
  return result;
}

export async function upsertVouchers(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  periods: Map<number, number>,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const result = new Map<string, number>();
  for (const item of batch.vouchers) {
    const periodId = periods.get(item.month);
    if (!periodId) throw new Error(`Missing period ${batch.spec.year}-${item.month}`);
    const data = {
      date: item.date, description: item.description, totalDebit: item.totalDebit,
      totalCredit: item.totalCredit, status: item.status, companyCode: batch.spec.companyCode,
      importId, sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
      sourceKey: item.sourceKey,
      voucherTypeCode: item.voucherTypeCode ?? null, voucherTypeName: item.voucherTypeName ?? null,
      isAdjustment: item.isAdjustment, preparerName: item.preparerName ?? null,
      reviewerName: item.reviewerName ?? null, posterName: item.posterName ?? null,
      cashierName: item.cashierName ?? null, attachmentCount: item.attachmentCount,
      sourcePosted: item.sourcePosted, sourceAudited: item.sourceAudited, sourceInvalid: item.sourceInvalid,
      externalSourceSystem: item.externalSourceSystem ?? null,
      externalSourceDocumentNo: item.externalSourceDocumentNo ?? null,
      externalSourceDocumentId: item.externalSourceDocumentId ?? null,
      externalSourceAccountSet: item.externalSourceAccountSet ?? null,
      externalSourceDate: item.externalSourceDate ?? null,
      sourceMetadata: item.sourceMetadata ?? {},
    };
    const sourceWhere = {
      sourceSystem_sourceDatabase_sourceKey: {
        sourceSystem: batch.spec.sourceSystem,
        sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: item.sourceKey,
      },
    };
    const voucherWhere = {
      voucherNo_companyCode_periodId: {
        voucherNo: item.voucherNo,
        companyCode: batch.spec.companyCode,
        periodId,
      },
    };
    const [sourceRecord, voucherRecord] = await Promise.all([
      tx.financeVoucher.findUnique({ where: sourceWhere, select: { id: true } }),
      tx.financeVoucher.findUnique({ where: voucherWhere, select: { id: true } }),
    ]);
    if (sourceRecord && voucherRecord && sourceRecord.id !== voucherRecord.id) {
      await tx.financeVoucher.update({
        where: { id: voucherRecord.id },
        data: {
          voucherNo: `${item.voucherNo}#archived-${voucherRecord.id}`,
          status: "archived",
          sourceInvalid: true,
        },
      });
    }
    const record = sourceRecord
      ? await tx.financeVoucher.update({
        where: { id: sourceRecord.id },
        data: { voucherNo: item.voucherNo, periodId, ...data },
      })
      : voucherRecord
        ? await tx.financeVoucher.update({ where: { id: voucherRecord.id }, data })
        : await tx.financeVoucher.create({ data: { voucherNo: item.voucherNo, periodId, ...data } });
    result.set(item.sourceKey, record.id);
  }
  return result;
}

export async function markLegacyVouchersOutsideSourceInvalid(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  periods: Map<number, number>,
  voucherIds: Map<string, number>,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const sourceIds = new Set(voucherIds.values());
  const existing = await tx.financeVoucher.findMany({
    where: {
      companyCode: batch.spec.companyCode, periodId: { in: [...periods.values()] },
      sourceSystem: null,
    },
    select: { id: true },
  });
  const staleIds = existing.filter((item) => !sourceIds.has(item.id)).map((item) => item.id);
  if (staleIds.length) {
    await tx.financeVoucher.updateMany({
      where: { id: { in: staleIds } },
      data: { status: "archived", sourceInvalid: true },
    });
  }
}

async function upsertVoucherItems(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  accountIds: Map<string, number>,
  voucherIds: Map<string, number>,
) {
  const items = new Map<string, number>();
  const itemsByVoucherSort = new Map<string, number>();
  const itemIds: number[] = [];
  for (const voucher of batch.vouchers) {
    const voucherId = voucherIds.get(voucher.sourceKey);
    if (!voucherId) throw new Error(`Missing voucher ${voucher.sourceKey}`);
    for (const item of voucher.items) {
      const accountId = accountIds.get(item.accountSourceKey);
      if (!accountId) throw new Error(`Missing account ${item.accountCode} for item ${item.sourceKey}`);
      const data = {
        debit: item.debit, credit: item.credit, description: item.description ?? null,
        importId, sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: item.sourceKey, currencyCode: item.currencyCode ?? null,
        exchangeRate: item.exchangeRate ?? null, originalDebit: item.originalDebit ?? null,
        originalCredit: item.originalCredit ?? null,
        settlementStyle: item.settlementStyle ?? null, settlementNo: item.settlementNo ?? null,
        settlementDate: item.settlementDate ?? null, sourceMetadata: item.sourceMetadata ?? {},
      };
      const record = await tx.financeVoucherItem.upsert({
        where: { voucherId_accountId_sortOrder: { voucherId, accountId, sortOrder: item.sortOrder } },
        create: { voucherId, accountId, sortOrder: item.sortOrder, ...data }, update: data,
      });
      items.set(item.sourceKey, record.id);
      itemsByVoucherSort.set(`${voucher.sourceKey}:${item.sortOrder}`, record.id);
      itemIds.push(record.id);
    }
  }
  return { items, itemsByVoucherSort, itemIds };
}


async function removeLegacyItemsOutsideSource(
  tx: Prisma.TransactionClient,
  voucherIds: Map<string, number>,
  itemIds: number[],
) {
  const sourceIds = new Set(itemIds);
  const existing = await tx.financeVoucherItem.findMany({
    where: { voucherId: { in: [...voucherIds.values()] }, sourceSystem: null },
    select: { id: true },
  });
  const staleIds = existing.filter((item) => !sourceIds.has(item.id)).map((item) => item.id);
  if (staleIds.length) await tx.financeVoucherItem.deleteMany({ where: { id: { in: staleIds } } });
}

export async function commitReadableCore(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
): Promise<CoreCommitContext> {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const periods = await upsertPeriods(tx, batch);
  const accounts = await upsertAccounts(tx, batch);
  const vouchers = await upsertVouchers(tx, batch, importId, periods);
  await markLegacyVouchersOutsideSourceInvalid(tx, batch, periods, vouchers);
  const itemResult = await upsertVoucherItems(tx, batch, importId, accounts, vouchers);
  await removeLegacyItemsOutsideSource(tx, vouchers, itemResult.itemIds);
  return { periods, accounts, vouchers, ...itemResult };
}
