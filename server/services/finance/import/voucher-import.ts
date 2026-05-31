import { prisma } from "@/lib/prisma";
import type { PreviewResult } from "./import";
import crypto from "crypto";

// ─── Fingerprint ───────────────────────────────────────────

function itemFingerprint(
  accountCode: string, debit: number, credit: number, description: string,
): string {
  const raw = `${accountCode}|${debit}|${credit}|${description}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

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
  let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, totalDeleted = 0;
  let voucherCreated = 0, voucherUpdated = 0, blocked = 0;
  const warnings: string[] = [];

  for (const voucherPreview of preview.vouchers || []) {
    const dateStr = normalizeDate(voucherPreview.date);
    const period = await getOrCreateVoucherPeriod(preview.companyCode, dateStr, preview.year);
    const month = String(period.month).padStart(2, "0");
    const voucherNo = `${preview.year}-${month}-${voucherPreview.voucherNo}`;
    const diff = Math.abs(voucherPreview.totalDebit - voucherPreview.totalCredit);

    if (diff > 0.01) {
      blocked++;
      warnings.push(
        `凭证 ${voucherNo} 源数据借贷不平衡，跳过导入：借方 ${voucherPreview.totalDebit.toFixed(2)} ≠ 贷方 ${voucherPreview.totalCredit.toFixed(2)}`,
      );
      continue;
    }

    const missingAccountCodes = voucherPreview.items
      .map((item) => item.accountCode)
      .filter((code) => !accountCodeToId.has(code));

    if (missingAccountCodes.length > 0) {
      blocked++;
      warnings.push(
        `凭证 ${voucherNo} 有 ${Array.from(new Set(missingAccountCodes)).join(", ")} 等科目未建档，跳过整张凭证`,
      );
      continue;
    }

    const nextItems = voucherPreview.items.map((item, index) => ({
      accountId: accountCodeToId.get(item.accountCode)!,
      debit: item.debit,
      credit: item.credit,
      description: item.description,
      sortOrder: index,
      importFingerprint: itemFingerprint(
        item.accountCode,
        item.debit,
        item.credit,
        item.description,
      ),
    }));

    const existing = await prisma.financeVoucher.findFirst({
      where: { voucherNo, companyCode: preview.companyCode, periodId: period.id },
      include: { items: { include: { reclassResults: true }, orderBy: { sortOrder: "asc" } } },
    });

    // Block if any item has non-pending ReclassResult
    if (existing) {
      const reviewed = existing.items.flatMap(it => it.reclassResults)
        .filter(rr => rr.status !== "pending");
      if (reviewed.length > 0) {
        blocked++;
        warnings.push(`凭证 ${voucherNo} 有 ${reviewed.length} 条已审核重分类结果，跳过导入`);
        continue;
      }
    }

    const currentFingerprints = (existing?.items || [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((item) => item.importFingerprint);
    const nextFingerprints = nextItems.map((item) => item.importFingerprint);
    const unchanged = existing
      && currentFingerprints.length === nextFingerprints.length
      && currentFingerprints.every((fp, index) => fp === nextFingerprints[index]);

    if (unchanged) {
      totalSkipped += nextItems.length;
      continue;
    }

    const result = await prisma.$transaction(async (tx) => {
      const voucher = existing
        ? await tx.financeVoucher.update({
            where: { id: existing.id },
            data: {
              date: dateStr, periodId: period.id,
              description: voucherPreview.description,
              totalDebit: Math.round(voucherPreview.totalDebit * 100) / 100,
              totalCredit: Math.round(voucherPreview.totalCredit * 100) / 100,
              companyCode: preview.companyCode,
            },
          })
        : await tx.financeVoucher.create({
            data: {
              voucherNo, date: dateStr, periodId: period.id,
              description: voucherPreview.description,
              totalDebit: Math.round(voucherPreview.totalDebit * 100) / 100,
              totalCredit: Math.round(voucherPreview.totalCredit * 100) / 100,
              companyCode: preview.companyCode,
              status: "posted",
            },
          });

      if (existing) {
        await tx.reclassResult.deleteMany({
          where: {
            voucherItem: { voucherId: voucher.id },
            status: "pending",
          },
        });
        await tx.financeVoucherItem.deleteMany({ where: { voucherId: voucher.id } });
      }

      if (nextItems.length > 0) {
        await tx.financeVoucherItem.createMany({
          data: nextItems.map((item) => ({
            voucherId: voucher.id,
            accountId: item.accountId,
            debit: item.debit,
            credit: item.credit,
            description: item.description,
            sortOrder: item.sortOrder,
            importFingerprint: item.importFingerprint,
            sourceFile: preview.sourceFileName,
            importId,
          })),
        });
      }

      return {
        created: existing ? 0 : nextItems.length,
        updated: existing ? nextItems.length : 0,
        deleted: existing ? existing.items.length : 0,
      };
    });

    if (existing) {
      voucherUpdated++;
    } else {
      voucherCreated++;
    }
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalDeleted += result.deleted;
  }

  return {
    imported: totalCreated + totalUpdated,
    created: totalCreated,
    updated: totalUpdated,
    deleted: totalDeleted,
    skipped: totalSkipped,
    blocked,
    warnings,
  };
}
