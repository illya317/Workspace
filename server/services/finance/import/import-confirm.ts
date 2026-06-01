import { prisma } from "@/lib/prisma";
import type { PreviewResult } from "./import";
import { importVouchers } from "./voucher-import";
import { createSnapshotFromPreview, materializeBaselineToPeriod } from "../ledger/annual-balances";
import { computeBalancesForPeriod } from "../ledger/balances";
import { buildReclassResults } from "../ledger/reclassify";

// ─── Types ─────────────────────────────────────────────────

export interface ImportConfirmSummary {
  /** Total items imported (created + updated). @deprecated use created + updated */
  imported: number;
  created: number;
  updated: number;
  deleted: number;
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
    for (const pa of parentAccounts) accountCodeToId.set(pa.code, pa.id);

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
        if (orig && !accountCodeToId.has(orig)) accountCodeToId.set(orig, fa.id);
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

// ─── Main Confirm ──────────────────────────────────────────

export async function confirmFinanceImport(
  preview: PreviewResult,
  userId?: number,
): Promise<FinanceImportConfirmResult> {
  if (!preview || preview.errors.length > 0) {
    throw new Error("预览数据有误，无法导入");
  }

  const totalRows = preview.type === "account"
    ? preview.accounts.length
    : preview.type === "balance"
      ? (preview.balances?.length || 0)
      : (preview.vouchers?.reduce((s, v) => s + v.items.length, 0) || 0);

  const importBatch = await prisma.financeLedgerImport.create({
    data: {
      type: preview.type, companyCode: preview.companyCode, year: preview.year,
      sourceFile: preview.sourceFileName, rowCount: totalRows,
      status: "completed", importedBy: userId,
    },
  });

  try {
    const accountCodeToId = await upsertAccounts(preview);

    // ── Account import ──
    if (preview.type === "account") {
      const count = preview.accounts.length;
      await prisma.financeLedgerImport.update({
        where: { id: importBatch.id },
        data: { createdCount: count, status: "completed" },
      });
      return {
        imported: count, created: count, updated: 0, deleted: 0, skipped: 0,
        conflicts: 0, blocked: 0, warnings: [],
        importId: importBatch.id,
        year: preview.year, companyCode: preview.companyCode, type: preview.type,
      };
    }

    // ── Balance import ──
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
        imported, created: imported, updated: 0, deleted: 0, skipped: 0,
        conflicts: 0, blocked: 0, warnings: [],
        importId: importBatch.id,
        year: preview.year, companyCode: preview.companyCode, type: preview.type,
        mode: preview.year === 2024 ? "baseline" : "reconcile",
      };
    }

    // ── Journal/Voucher import ──
    const { imported, created, updated, deleted, skipped, blocked, warnings } =
      await importVouchers(preview, accountCodeToId, importBatch.id);

    await prisma.financeLedgerImport.update({
      where: { id: importBatch.id },
      data: {
        createdCount: created, updatedCount: updated,
        deletedCount: deleted, skippedCount: skipped,
        blockedCount: blocked,
        status: blocked > 0 ? "partial" : "completed",
        warnings: warnings.length > 0 ? JSON.stringify(warnings) : null,
      },
    });

    // Auto-recompute balances for latest month
    let latestYm: { year: number; month: number } | null = null;
    const reclassPeriods = new Set<number>();
    for (const v of preview.vouchers || []) {
      const d = new Date(v.date);
      if (isNaN(d.getTime())) continue;
      const y = d.getFullYear(), m = d.getMonth() + 1;
      const period = await prisma.financePeriod.findFirst({
        where: { companyCode: preview.companyCode, year: y, month: m },
      });
      if (period) reclassPeriods.add(period.id);
      if (!latestYm || y > latestYm.year || (y === latestYm.year && m > latestYm.month)) {
        latestYm = { year: y, month: m };
      }
    }
    // Auto-reclass for all affected periods
    for (const pid of reclassPeriods) {
      try { await buildReclassResults(pid, { dryRun: false }); } catch { /* skip */ }
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
      imported, created, updated, deleted, skipped, conflicts: 0, blocked, warnings,
      importId: importBatch.id,
      year: preview.year, companyCode: preview.companyCode, type: preview.type,
    };
  } catch (err) {
    await prisma.financeLedgerImport.update({
      where: { id: importBatch.id },
      data: {
        status: "failed",
        warnings: JSON.stringify([err instanceof Error ? err.message : "导入失败"]),
      },
    });
    throw err;
  }
}
