import { prisma } from "@/lib/prisma";
import type { PreviewResult } from "./import";
import { createSnapshotFromPreview, materializeBaselineToPeriod } from "../ledger/annual-balances";
import { computeBalancesForPeriod } from "../ledger/balances";
import crypto from "crypto";

// ─── Types ─────────────────────────────────────────────────

export interface ImportConfirmSummary {
  /** Total items imported (created + updated). @deprecated use created + updated */
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  blocked: number;
  warnings: string[];
  importId?: number;
}

export type FinanceImportConfirmResult = ImportConfirmSummary & {
  year: number;
  companyCode: string;
  type: PreviewResult["type"];
  mode?: "baseline" | "reconcile";
};

// ─── Fingerprint ───────────────────────────────────────────

function itemFingerprint(
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

// ─── Upsert Accounts ───────────────────────────────────────

async function upsertAccounts(preview: PreviewResult) {
  const { type, companyCode, year, accounts } = preview;
  const accountCodeToId = new Map<string, number>();
  const sortedAccounts = [...accounts].sort((a, b) => a.code.length - b.code.length);

  let groupCodeMap: Map<string, string> | null = null;
  let groupNameMap: Map<string, string> | null = null;
  if (type === "account" && companyCode !== "01" && year) {
    const groupAccounts = await prisma.financeAccount.findMany({
      where: { companyCode: "01", year },
      select: { code: true, name: true },
    });
    groupCodeMap = new Map(groupAccounts.map((a) => [a.code, a.code]));
    groupNameMap = new Map();
    for (const account of groupAccounts) {
      if (!groupNameMap.has(account.name)) groupNameMap.set(account.name, account.code);
    }
  }

  const missingParentCodes = new Set<string>();
  for (const account of sortedAccounts) {
    if (account.parentCode && !accountCodeToId.has(account.parentCode)) {
      missingParentCodes.add(account.parentCode);
    }
  }
  if (missingParentCodes.size > 0) {
    const parentAccounts = await prisma.financeAccount.findMany({
      where: { code: { in: Array.from(missingParentCodes) }, companyCode, year },
      select: { id: true, code: true },
    });
    for (const pa of parentAccounts) {
      accountCodeToId.set(pa.code, pa.id);
    }
    const stillMissing = Array.from(missingParentCodes).filter(c => !accountCodeToId.has(c));
    if (stillMissing.length > 0) {
      const fallbackCodes = new Set<string>();
      const codeToOriginal = new Map<string, string>();
      for (const code of stillMissing) {
        for (let len = code.length - 2; len >= 4; len -= 2) {
          const fallback = code.slice(0, len);
          fallbackCodes.add(fallback);
          if (!codeToOriginal.has(fallback)) codeToOriginal.set(fallback, code);
        }
      }
      const fallbackAccounts = await prisma.financeAccount.findMany({
        where: { code: { in: Array.from(fallbackCodes) }, companyCode, year },
        select: { id: true, code: true },
      });
      for (const fa of fallbackAccounts) {
        accountCodeToId.set(fa.code, fa.id);
        const orig = codeToOriginal.get(fa.code);
        if (orig && !accountCodeToId.has(orig)) {
          accountCodeToId.set(orig, fa.id);
        }
      }
    }
  }

  for (const account of sortedAccounts) {
    const parentId = account.parentCode ? accountCodeToId.get(account.parentCode) ?? null : null;
    const existing = await prisma.financeAccount.findFirst({
      where: { code: account.code, companyCode, year },
    });

    let groupSubjectCode: string | null = null;
    if (type === "account" && companyCode === "01") {
      groupSubjectCode = account.code;
    } else if (groupCodeMap && groupNameMap) {
      groupSubjectCode = groupCodeMap.get(account.code) ?? groupNameMap.get(account.name) ?? null;
    }

    const data = {
      name: account.name, category: account.category,
      balanceDirection: account.balanceDirection, parentId, companyCode,
      mnemonicCode: account.mnemonicCode ?? null, currency: account.currency ?? null,
      groupSubjectCode, subjectLevel: account.subjectLevel ?? null, year,
    };

    if (existing) {
      await prisma.financeAccount.update({ where: { id: existing.id }, data });
      accountCodeToId.set(account.code, existing.id);
    } else {
      const created = await prisma.financeAccount.create({
        data: { code: account.code, ...data, sortOrder: 0, isActive: true },
      });
      accountCodeToId.set(account.code, created.id);
    }
  }
  return accountCodeToId;
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

// ─── Import Vouchers with Fingerprint Dedup & Reclass Protection ──

async function importVouchers(
  preview: PreviewResult,
  accountCodeToId: Map<string, number>,
  importId: number,
): Promise<{ imported: number; created: number; updated: number; skipped: number; blocked: number; warnings: string[] }> {
  let created = 0, updated = 0, skipped = 0, blocked = 0;
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

    // Check if voucher exists and has non-pending reclass results (block overwrite)
    if (existing) {
      const nonPendingResults = existing.items.flatMap(it => it.reclassResults)
        .filter(rr => rr.status !== "pending");
      if (nonPendingResults.length > 0) {
        blocked++;
        warnings.push(`凭证 ${voucherNo} 存在 ${nonPendingResults.length} 条已审核重分类结果，跳过导入以免覆盖`);
        continue;
      }

      // Delete old items to replace with new ones
      await prisma.financeVoucherItem.deleteMany({ where: { voucherId: existing.id } });
    }

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

    // Create voucher items with fingerprints
    let itemCreated = 0, itemSkipped = 0;
    for (let i = 0; i < voucherPreview.items.length; i++) {
      const item = voucherPreview.items[i];
      const accountId = accountCodeToId.get(item.accountCode);
      if (!accountId) continue;

      const fp = itemFingerprint(
        preview.companyCode, voucherPreview.voucherNo, voucherPreview.date,
        i, item.accountCode, item.debit, item.credit, item.description,
      );

      // Check if identical item already exists in this voucher
      const existingItem = await prisma.financeVoucherItem.findFirst({
        where: { voucherId: voucher.id, importFingerprint: fp },
      });
      if (existingItem) {
        itemSkipped++;
        continue;
      }

      await prisma.financeVoucherItem.create({
        data: {
          voucherId: voucher.id, accountId,
          debit: item.debit, credit: item.credit,
          description: item.description,
          sortOrder: i,
          importFingerprint: fp,
          sourceFile: preview.sourceFileName,
          importId,
        },
      });
      itemCreated++;
    }

    if (itemCreated > 0) {
      if (existing) updated++; else created++;
    } else if (itemSkipped > 0 && existing) {
      skipped++;
    }
  }

  return { imported: created + updated, created, updated, skipped, blocked, warnings };
}

// ─── Main Confirm ──────────────────────────────────────────

export async function confirmFinanceImport(
  preview: PreviewResult,
  userId?: number,
): Promise<FinanceImportConfirmResult> {
  if (!preview || preview.errors.length > 0) {
    throw new Error("预览数据有误，无法导入");
  }

  // Create import batch record
  const totalRows = preview.type === "account"
    ? preview.accounts.length
    : preview.type === "balance"
      ? (preview.balances?.length || 0)
      : (preview.vouchers?.reduce((s, v) => s + v.items.length, 0) || 0);

  const importBatch = await prisma.financeLedgerImport.create({
    data: {
      type: preview.type,
      companyCode: preview.companyCode,
      year: preview.year,
      sourceFile: preview.sourceFileName,
      rowCount: totalRows,
      status: "completed",
      importedBy: userId,
    },
  });

  try {
    const accountCodeToId = await upsertAccounts(preview);

    if (preview.type === "account") {
      await prisma.financeLedgerImport.update({
        where: { id: importBatch.id },
        data: { createdCount: preview.accounts.length, status: "completed" },
      });
      const count = preview.accounts.length;
      return {
        imported: count, created: count, updated: 0, skipped: 0,
        conflicts: 0, blocked: 0, warnings: [],
        importId: importBatch.id,
        year: preview.year, companyCode: preview.companyCode, type: preview.type,
      };
    }

    if (preview.type === "balance") {
      const imported = await createSnapshotFromPreview(preview, accountCodeToId);
      if (preview.year === 2024) {
        const period = await prisma.financePeriod.findFirst({
          where: { companyCode: preview.companyCode, year: preview.year, month: 12 },
        });
        if (period) {
          await materializeBaselineToPeriod(preview.companyCode, preview.year, async (_c, _y, _m) => period);
        }
      }
      await prisma.financeLedgerImport.update({
        where: { id: importBatch.id },
        data: { createdCount: imported, status: "completed" },
      });
      return {
        imported, created: imported, updated: 0, skipped: 0, conflicts: 0, blocked: 0, warnings: [],
        importId: importBatch.id,
        year: preview.year, companyCode: preview.companyCode, type: preview.type,
        mode: preview.year === 2024 ? "baseline" : "reconcile",
      };
    }

    // Journal import
    const { imported, created, updated, skipped, blocked, warnings } = await importVouchers(preview, accountCodeToId, importBatch.id);

    // Update batch record
    await prisma.financeLedgerImport.update({
      where: { id: importBatch.id },
      data: {
        createdCount: created, updatedCount: updated,
        skippedCount: skipped, blockedCount: blocked,
        status: blocked > 0 ? "partial" : "completed",
        warnings: warnings.length > 0 ? JSON.stringify(warnings) : null,
      },
    });

    // Auto-recompute balances for the latest month
    let latestYm: { year: number; month: number } | null = null;
    for (const v of preview.vouchers || []) {
      const d = new Date(v.date);
      if (isNaN(d.getTime())) continue;
      const y = d.getFullYear(), m = d.getMonth() + 1;
      if (!latestYm || y > latestYm.year || (y === latestYm.year && m > latestYm.month)) {
        latestYm = { year: y, month: m };
      }
    }
    if (latestYm) {
      const period = await prisma.financePeriod.findFirst({
        where: { companyCode: preview.companyCode, year: latestYm.year, month: latestYm.month },
      });
      if (period) {
        try { await computeBalancesForPeriod(period.id); } catch { /* skip */ }
      }
    }

    return {
      imported, created, updated, skipped, conflicts: 0, blocked, warnings,
      importId: importBatch.id,
      year: preview.year, companyCode: preview.companyCode, type: preview.type,
    };
  } catch (err) {
    await prisma.financeLedgerImport.update({
      where: { id: importBatch.id },
      data: { status: "failed", warnings: JSON.stringify([err instanceof Error ? err.message : "导入失败"]) },
    });
    throw err;
  }
}
