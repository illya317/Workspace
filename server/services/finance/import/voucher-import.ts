import { prisma } from "@/lib/prisma";
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
  skipped: number; blocked: number; warnings: string[];
}> {
  let created = 0, updated = 0, deleted = 0, blocked = 0;
  const warnings: string[] = [];

  for (const voucherPreview of preview.vouchers || []) {
    const dateStr = normalizeDate(voucherPreview.date);
    const period = await getOrCreateVoucherPeriod(preview.companyCode, dateStr, preview.year);
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
      // Delete all old items
      if (existing.items.length > 0) {
        await prisma.financeVoucherItem.deleteMany({ where: { voucherId: existing.id } });
        deleted += existing.items.length;
      }
    }

    // Upsert voucher header
    const voucher = existing
      ? await prisma.financeVoucher.update({
          where: { id: existing.id },
          data: {
            date: dateStr, periodId: period.id,
            description: voucherPreview.description,
            totalDebit: voucherPreview.totalDebit,
            totalCredit: voucherPreview.totalCredit,
            companyCode: preview.companyCode,
          },
        })
      : await prisma.financeVoucher.create({
          data: {
            voucherNo, date: dateStr, periodId: period.id,
            description: voucherPreview.description,
            totalDebit: voucherPreview.totalDebit,
            totalCredit: voucherPreview.totalCredit,
            companyCode: preview.companyCode,
            status: "posted",
          },
        });

    // Create new items — sortOrder follows Excel row order
    let itemCount = 0;
    for (let i = 0; i < voucherPreview.items.length; i++) {
      const item = voucherPreview.items[i];
      const accountId = accountCodeToId.get(item.accountCode);
      if (!accountId) continue;

      await prisma.financeVoucherItem.create({
        data: {
          voucherId: voucher.id, accountId,
          debit: item.debit, credit: item.credit,
          description: item.description, sortOrder: i,
          sourceFile: preview.sourceFileName, importId,
        },
      });
      itemCount++;
    }

    if (existing) updated++; else created++;
    if (itemCount < voucherPreview.items.length) {
      warnings.push(`凭证 ${voucherNo}: ${voucherPreview.items.length - itemCount} 条分录的科目编码未找到`);
    }
  }

  return {
    imported: created + updated,
    created, updated, deleted, skipped: 0, blocked, warnings,
  };
}
