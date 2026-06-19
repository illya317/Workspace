import { prisma } from "@workspace/platform/server/prisma";
import type { PreviewResult } from "./import";

// ─── Helpers ───────────────────────────────────────────────

function normalizeDate(date: string) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(date) ? date.replace(/\./g, "-") : date;
}

async function getOrCreateVoucherPeriod(companyCode: string, dateStr: string, fallbackYear: number) {
  const voucherDate = new Date(dateStr);
  const year = Number.isNaN(voucherDate.getTime()) ? fallbackYear : voucherDate.getFullYear();
  const month = Number.isNaN(voucherDate.getTime()) ? 12 : voucherDate.getMonth() + 1;
  const existing = await prisma.financePeriod.findFirst({ where: { year, month, companyCode } });
  if (existing) return existing;
  const lastDay = new Date(year, month, 0).getDate();
  return prisma.financePeriod.create({
    data: {
      year, month,
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
      companyCode,
    },
  });
}

// ─── Import Vouchers ───────────────────────────────────────

export async function importVouchers(
  preview: PreviewResult,
  accountCodeToId: Map<string, number>,
  importId: number,
): Promise<{
  imported: number; created: number; updated: number; deleted: number;
  skipped: number; blocked: number; warnings: string[]; affectedPeriodIds: number[];
}> {
  let created = 0, updated = 0, deleted = 0, skipped = 0, blocked = 0;
  const warnings: string[] = [];
  const affectedPeriodIds = new Set<number>();

  for (const voucherPreview of preview.vouchers || []) {
    const dateStr = normalizeDate(voucherPreview.date);
    const period = await getOrCreateVoucherPeriod(preview.companyCode, dateStr, preview.year);
    affectedPeriodIds.add(period.id);
    const month = String(period.month).padStart(2, "0");
    const voucherNo = `${preview.year}-${month}-${voucherPreview.voucherNo}`;

    const existing = await prisma.financeVoucher.findFirst({
      where: { voucherNo, companyCode: preview.companyCode, periodId: period.id },
      include: { items: { include: { reclassResults: true } } },
    });

    // Block overwrite if any item has non-pending reclass results
    if (existing) {
      const reviewed = existing.items.flatMap(it => it.reclassResults)
        .filter(rr => rr.status !== "pending");
      if (reviewed.length > 0) {
        blocked++;
        warnings.push(
          `凭证 ${voucherNo} 有 ${reviewed.length} 条已审核重分类结果，跳过导入`
        );
        continue;
      }
    }

    const newItems: { accountId: number; debit: number; credit: number; description: string; sortOrder: number; sourceFile: string; importId: number }[] = [];
    for (let i = 0; i < voucherPreview.items.length; i++) {
      const item = voucherPreview.items[i];
      const accountId = accountCodeToId.get(item.accountCode);
      if (!accountId) {
        warnings.push(`凭证 ${voucherNo}: 科目 ${item.accountCode} 未建档，跳过该分录`);
        continue;
      }
      newItems.push({
        accountId,
        debit: item.debit, credit: item.credit,
        description: item.description, sortOrder: i,
        sourceFile: preview.sourceFileName || "", importId,
      });
    }

    // Warn if source data is unbalanced
    const srcDiff = Math.abs(voucherPreview.totalDebit - voucherPreview.totalCredit);
    if (srcDiff > 0.01) {
      warnings.push(
        `凭证 ${voucherNo} 源数据借贷不平：借方 ${voucherPreview.totalDebit.toFixed(2)} ≠ 贷方 ${voucherPreview.totalCredit.toFixed(2)}，已按分录实际写入`
      );
    }

    if (!existing && newItems.length === 0) {
      skipped += voucherPreview.items.length;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // Delete all old items + pending reclass results
      if (existing && existing.items.length > 0) {
        await tx.reclassResult.deleteMany({
          where: { voucherItem: { voucherId: existing.id }, status: "pending" },
        });
        await tx.financeVoucherItem.deleteMany({ where: { voucherId: existing.id } });
      }

      // Upsert voucher header — recalculate totals from actual items
      const totalDebit = newItems.reduce((s, it) => s + it.debit, 0);
      const totalCredit = newItems.reduce((s, it) => s + it.credit, 0);

      const voucher = existing
        ? await tx.financeVoucher.update({
            where: { id: existing.id },
            data: {
              date: dateStr, periodId: period.id,
              description: voucherPreview.description,
              totalDebit: Math.round(totalDebit * 100) / 100,
              totalCredit: Math.round(totalCredit * 100) / 100,
              companyCode: preview.companyCode,
            },
          })
        : await tx.financeVoucher.create({
            data: {
              voucherNo, date: dateStr, periodId: period.id,
              description: voucherPreview.description,
              totalDebit: Math.round(totalDebit * 100) / 100,
              totalCredit: Math.round(totalCredit * 100) / 100,
              companyCode: preview.companyCode,
              status: "posted",
            },
          });

      // Create all new items
      if (newItems.length > 0) {
        await tx.financeVoucherItem.createMany({
          data: newItems.map(it => ({ ...it, voucherId: voucher.id })),
        });
      }
    });

    if (existing) {
      updated++;
      deleted += existing.items.length;
    } else {
      created++;
    }
  }

  return {
    imported: created + updated,
    created, updated, deleted, skipped, blocked, warnings,
    affectedPeriodIds: [...affectedPeriodIds],
  };
}
