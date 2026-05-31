import { prisma } from "@/lib/prisma";
import type { PreviewResult } from "./import";
import crypto from "crypto";

// ─── Fingerprint ───────────────────────────────────────────

export function itemFingerprint(
  companyCode: string,
  voucherNo: string,
  date: string,
  sortOrder: number,
  accountCode: string,
  debit: number,
  credit: number,
  description: string,
): string {
  const raw = `${companyCode}|${voucherNo}|${date}|${sortOrder}|${accountCode}|${debit}|${credit}|${description}`;
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
  let created = 0, updated = 0, skipped = 0, blocked = 0;
  let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, totalDeleted = 0;
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

    // Load existing items BEFORE any mutation
    const oldItems = existing
      ? await prisma.financeVoucherItem.findMany({
          where: { voucherId: existing.id },
          include: { reclassResults: true },
        })
      : [];

    // Block overwrite if any item has non-pending reclass results
    const nonPendingResults = oldItems.flatMap(it => it.reclassResults)
      .filter(rr => rr.status !== "pending");
    if (nonPendingResults.length > 0) {
      blocked++;
      warnings.push(
        `凭证 ${voucherNo} 存在 ${nonPendingResults.length} 条已审核重分类结果，` +
        `跳过导入以免覆盖。请先驳回或处理这些审核结果。`
      );
      continue;
    }

    // Index old items by logical key: accountId|sortOrder
    const oldByKey = new Map<string, (typeof oldItems)[number]>();
    for (const oi of oldItems) {
      oldByKey.set(`${oi.accountId}|${oi.sortOrder}`, oi);
    }
    const seenKeys = new Set<string>();

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

    let itemCreated = 0, itemUpdated = 0, itemSkipped = 0, itemDeleted = 0;

    // Process each new item: match by accountId+sortOrder, compare fingerprint
    for (let i = 0; i < voucherPreview.items.length; i++) {
      const item = voucherPreview.items[i];
      const accountId = accountCodeToId.get(item.accountCode);
      if (!accountId) continue;

      const fp = itemFingerprint(
        preview.companyCode, voucherPreview.voucherNo, voucherPreview.date,
        i, item.accountCode, item.debit, item.credit, item.description,
      );

      const key = `${accountId}|${i}`;
      const oldItem = oldByKey.get(key);

      if (oldItem) {
        seenKeys.add(key);
        if (oldItem.importFingerprint === fp) {
          // Identical: same logical key + same fingerprint → skip
          itemSkipped++;
        } else {
          // Same logical key, different fingerprint → update content
          await prisma.financeVoucherItem.update({
            where: { id: oldItem.id },
            data: {
              debit: item.debit, credit: item.credit,
              description: item.description,
              importFingerprint: fp,
              sourceFile: preview.sourceFileName,
              importId,
            },
          });
          itemUpdated++;
        }
      } else {
        // New item (no old item at this logical key)
        await prisma.financeVoucherItem.create({
          data: {
            voucherId: voucher.id, accountId,
            debit: item.debit, credit: item.credit,
            description: item.description, sortOrder: i,
            importFingerprint: fp,
            sourceFile: preview.sourceFileName,
            importId,
          },
        });
        itemCreated++;
      }
    }

    // Delete old items that no longer exist in the new upload
    for (const [key, oldItem] of oldByKey) {
      if (!seenKeys.has(key)) {
        await prisma.financeVoucherItem.delete({ where: { id: oldItem.id } });
        itemDeleted++;
      }
    }

    // Classify voucher-level outcome
    if (itemCreated > 0 || itemUpdated > 0 || itemDeleted > 0) {
      if (existing) updated++; else created++;
    } else if (itemSkipped > 0) {
      skipped++;
    }
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
