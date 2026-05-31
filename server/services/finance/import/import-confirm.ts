import { prisma } from "@/lib/prisma";
import type { PreviewResult } from "./import";
import { createSnapshotFromPreview, materializeBaselineToPeriod } from "../ledger/annual-balances";
import { computeBalancesForPeriod } from "../ledger/balances";

export type FinanceImportConfirmResult = {
  imported: number;
  year: number;
  companyCode: string;
  type: PreviewResult["type"];
  mode?: "baseline" | "reconcile";
};

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

  // 批量预加载可能缺失的父科目。部分科目表跳级（如只有6601和66010101，无660101）
  // 先收集直接父级，再对不存在的尝试逐级缩短（每次减2位，最少4位）
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

    // 对仍然缺失的父级code，尝试更短前缀（每次减2位，最低4位）
    const stillMissing = Array.from(missingParentCodes).filter(c => !accountCodeToId.has(c));
    if (stillMissing.length > 0) {
      const fallbackCodes = new Set<string>();
      const codeToOriginal = new Map<string, string>(); // fallback code → original missing code
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
        // 也把原始缺失code映射到找到的父级（这样accountCodeToId.get("660101")也能找到6601的id）
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
      name: account.name,
      category: account.category,
      balanceDirection: account.balanceDirection,
      parentId,
      companyCode,
      mnemonicCode: account.mnemonicCode ?? null,
      currency: account.currency ?? null,
      groupSubjectCode,
      subjectLevel: account.subjectLevel ?? null,
      year,
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
      year,
      month,
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
      companyCode,
    },
  });
}

async function importVouchers(preview: PreviewResult, accountCodeToId: Map<string, number>) {
  let imported = 0;
  for (const voucherPreview of preview.vouchers || []) {
    const dateStr = normalizeDate(voucherPreview.date);
    const period = await getOrCreateVoucherPeriod(preview.companyCode, dateStr, preview.year);
    const month = String(period.month).padStart(2, "0");
    const voucherNo = `${preview.year}-${month}-${voucherPreview.voucherNo}`;
    const existing = await prisma.financeVoucher.findUnique({
      where: { voucherNo_companyCode: { voucherNo, companyCode: preview.companyCode } },
    });

    const voucher = existing
      ? await prisma.financeVoucher.update({
          where: { id: existing.id },
          data: {
            date: dateStr,
            periodId: period.id,
            description: voucherPreview.description,
            totalDebit: voucherPreview.totalDebit,
            totalCredit: voucherPreview.totalCredit,
            companyCode: preview.companyCode,
          },
        })
      : await prisma.financeVoucher.create({
          data: {
            voucherNo,
            date: dateStr,
            periodId: period.id,
            description: voucherPreview.description,
            totalDebit: voucherPreview.totalDebit,
            totalCredit: voucherPreview.totalCredit,
            companyCode: preview.companyCode,
            status: "posted",
          },
        });

    if (existing) await prisma.financeVoucherItem.deleteMany({ where: { voucherId: existing.id } });

    for (const item of voucherPreview.items) {
      const accountId = accountCodeToId.get(item.accountCode);
      if (!accountId) continue;
      await prisma.financeVoucherItem.create({
        data: {
          voucherId: voucher.id,
          accountId,
          debit: item.debit,
          credit: item.credit,
          description: item.description,
        },
      });
    }
    imported++;
  }
  return imported;
}

export async function confirmFinanceImport(preview: PreviewResult): Promise<FinanceImportConfirmResult> {
  if (!preview || preview.errors.length > 0) {
    throw new Error("预览数据有误，无法导入");
  }

  const accountCodeToId = await upsertAccounts(preview);

  if (preview.type === "account") {
    return {
      imported: preview.accounts.length,
      year: preview.year,
      companyCode: preview.companyCode,
      type: preview.type,
    };
  }

  if (preview.type === "balance") {
    const imported = await createSnapshotFromPreview(preview, accountCodeToId);
    // Auto-materialize baseline to 12月 period
    if (preview.year === 2024) {
      const period = await prisma.financePeriod.findFirst({
        where: { companyCode: preview.companyCode, year: preview.year, month: 12 },
      });
      if (period) {
        await materializeBaselineToPeriod(preview.companyCode, preview.year, async (_c, _y, _m) => period);
      }
    }
    return {
      imported,
      year: preview.year,
      companyCode: preview.companyCode,
      type: preview.type,
      mode: preview.year === 2024 ? "baseline" : "reconcile",
    };
  }

  // Journal import: auto-recompute latest affected month (covers all prior months)
  const count = await importVouchers(preview, accountCodeToId);
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
      try { await computeBalancesForPeriod(period.id); } catch { /* skip if baseline not ready */ }
    }
  }

  return { imported: count, year: preview.year, companyCode: preview.companyCode, type: preview.type };
}
