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

    // Index old items by sortOrder
    type OldItem = { id: number; sortOrder: number; importFingerprint: string | null };
    const oldByPos = new Map<number, OldItem>();
    if (existing) {
      for (const oi of existing.items) oldByPos.set(oi.sortOrder, oi);
    }
    const seenPositions = new Set<number>();

    let itemCreated = 0, itemUpdated = 0, itemSkipped = 0;

    for (let i = 0; i < voucherPreview.items.length; i++) {
      const item = voucherPreview.items[i];
      const accountId = accountCodeToId.get(item.accountCode);
      if (!accountId) continue;

      const fp = itemFingerprint(item.accountCode, item.debit, item.credit, item.description);
      const oldItem = oldByPos.get(i);

      if (oldItem) {
        seenPositions.add(i);
        if (oldItem.importFingerprint === fp) {
          // Same position, same content → skip
          itemSkipped++;
        } else {
          // Same position, different content → update in place
          await prisma.financeVoucherItem.update({
            where: { id: oldItem.id },
            data: {
              accountId, debit: item.debit, credit: item.credit,
              description: item.description, importFingerprint: fp,
              sourceFile: preview.sourceFileName, importId,
            },
          });
          itemUpdated++;
        }
      } else {
        // New position → create
        await prisma.financeVoucherItem.create({
          data: {
            voucherId: voucher.id, accountId,
            debit: item.debit, credit: item.credit,
            description: item.description, sortOrder: i,
            importFingerprint: fp,
            sourceFile: preview.sourceFileName, importId,
          },
        });
        itemCreated++;
      }
    }

    // Delete old items at positions no longer in the new set
    let itemDeleted = 0;
    for (const [pos, oldItem] of oldByPos) {
      if (!seenPositions.has(pos)) {
        await prisma.reclassResult.deleteMany({
          where: { voucherItemId: oldItem.id },
        });
        await prisma.financeVoucherItem.delete({ where: { id: oldItem.id } });
        itemDeleted++;
      }
    }

    if (existing) voucherUpdated++; else voucherCreated++;
    totalCreated += itemCreated;
    totalUpdated += itemUpdated;
    totalSkipped += itemSkipped;
    totalDeleted += itemDeleted;
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
