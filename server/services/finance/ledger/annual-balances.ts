import { prisma } from "@/lib/prisma";
import { CODE_TO_NAME } from "@/lib/company";
import type { PreviewResult } from "../import/import";
import type { SideBalance } from "./balance-utils";

/**
 * 查找 targetYear 及之前最近一个 active baseline snapshot 的年份。
 * 同一 (companyCode, year) 只能有一个 active baseline。
 * 包含 targetYear 自身，这样计算 baseline 年份本身的 12 月时可以找到自己。
 */
export async function findActiveBaselineYear(companyCode: string, targetYear: number): Promise<number | null> {
  const baseline = await prisma.financeBalanceSnapshot.findFirst({
    where: {
      companyCode,
      snapshotType: "baseline",
      isActive: true,
      year: { lte: targetYear },
    },
    orderBy: { year: "desc" },
    select: { year: true },
  });
  return baseline?.year ?? null;
}

/**
 * 获取某年度 active baseline snapshot 的 closing 余额。
 * 返回 Map<accountCode, SideBalance>
 */
export async function loadActiveBaselineClosing(companyCode: string, year: number): Promise<Map<string, SideBalance>> {
  const snapshot = await prisma.financeBalanceSnapshot.findFirst({
    where: { companyCode, year, snapshotType: "baseline", isActive: true },
    include: {
      rows: {
        include: { account: true },
      },
    },
  });

  const map = new Map<string, SideBalance>();
  if (!snapshot) return map;

  for (const row of snapshot.rows) {
    map.set(row.accountCode, {
      debit: row.closingDebit,
      credit: row.closingCredit,
    });
  }
  return map;
}

/**
 * 读取指定年份 snapshot 的 closing 余额（不要求 isActive，用于校准对比）。
 */
export async function loadSnapshotClosing(companyCode: string, year: number): Promise<Map<string, SideBalance>> {
  const rows = await prisma.financeBalanceSnapshotRow.findMany({
    where: {
      snapshot: { companyCode, year },
    },
    include: { account: true },
  });

  const map = new Map<string, SideBalance>();
  for (const row of rows) {
    map.set(row.accountCode, {
      debit: row.closingDebit,
      credit: row.closingCredit,
    });
  }
  return map;
}

/**
 * 将 active baseline snapshot 的年末余额 materialize 到 FinanceAccountBalance（12月期间）。
 * FinanceAccountBalance 只做展示/缓存，不是数据源头。
 */
export async function materializeBaselineToPeriod(
  companyCode: string,
  year: number,
  getOrCreatePeriod: (companyCode: string, year: number, month: number) => Promise<{ id: number }>,
) {
  const snapshot = await prisma.financeBalanceSnapshot.findFirst({
    where: { companyCode, year, snapshotType: "baseline", isActive: true },
    include: {
      rows: {
        include: { account: true },
      },
    },
  });

  if (!snapshot || snapshot.rows.length === 0) {
    const companyName = CODE_TO_NAME[companyCode] || companyCode;
    throw new Error(`请先为${companyName}导入 ${year} 年年度余额表作为 active baseline`);
  }

  const period = await getOrCreatePeriod(companyCode, year, 12);
  const results = [];

  for (const row of snapshot.rows) {
    results.push(
      await prisma.financeAccountBalance.upsert({
        where: { accountId_periodId: { accountId: row.accountId, periodId: period.id } },
        update: {
          openingDebit: row.openingDebit,
          openingCredit: row.openingCredit,
          currentDebit: row.currentDebit,
          currentCredit: row.currentCredit,
          closingDebit: row.closingDebit,
          closingCredit: row.closingCredit,
          companyCode,
        },
        create: {
          accountId: row.accountId,
          periodId: period.id,
          openingDebit: row.openingDebit,
          openingCredit: row.openingCredit,
          currentDebit: row.currentDebit,
          currentCredit: row.currentCredit,
          closingDebit: row.closingDebit,
          closingCredit: row.closingCredit,
          companyCode,
        },
      }),
    );
  }

  return { period, results };
}

/**
 * 从导入预览创建 Snapshot 批次 + 明细行。
 * 2024 默认 baseline + active，其他年份默认 reconcile。
 */
export async function createSnapshotFromPreview(
  preview: PreviewResult,
  accountCodeToId: Map<string, number>,
) {
  if (!preview.balances || preview.balances.length === 0) return 0;

  const snapshotType = preview.year === 2024 ? "baseline" : "reconcile";
  const isActive = preview.year === 2024;

  // 如果是 baseline 且要设 active，先取消同 (companyCode, year) 下其他 active baseline
  if (snapshotType === "baseline" && isActive) {
    await prisma.financeBalanceSnapshot.updateMany({
      where: { companyCode: preview.companyCode, year: preview.year, snapshotType: "baseline", isActive: true },
      data: { isActive: false },
    });
  }

  const snapshot = await prisma.financeBalanceSnapshot.create({
    data: {
      companyCode: preview.companyCode,
      year: preview.year,
      snapshotType,
      isActive,
      sourceFile: preview.sourceFileName ?? null,
      rowCount: preview.balances.length,
      importedAt: new Date(),
    },
  });

  let imported = 0;
  for (const bal of preview.balances) {
    const accountId = accountCodeToId.get(bal.accountCode);
    if (!accountId) continue;

    await prisma.financeBalanceSnapshotRow.create({
      data: {
        snapshotId: snapshot.id,
        accountId,
        accountCode: bal.accountCode,
        accountName: bal.accountName,
        openingDebit: bal.openingDebit,
        openingCredit: bal.openingCredit,
        currentDebit: bal.currentDebit,
        currentCredit: bal.currentCredit,
        closingDebit: bal.closingDebit,
        closingCredit: bal.closingCredit,
      },
    });
    imported++;
  }

  return imported;
}

/**
 * 将任意 snapshot 提升为 active baseline（同 companyCode+year 下只有一个）。
 * reconcile snapshot 会被 promote 为 baseline 并激活。
 * 换 baseline 后，受影响的月度余额缓存需要失效重算。
 */
export async function setActiveBaseline(snapshotId: number) {
  const snapshot = await prisma.financeBalanceSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new Error("Snapshot 不存在");

  // 取消同 companyCode+year 下其他 active baseline
  await prisma.financeBalanceSnapshot.updateMany({
    where: { companyCode: snapshot.companyCode, year: snapshot.year, isActive: true },
    data: { isActive: false },
  });

  // promote + activate，返回更新后的记录
  const updated = await prisma.financeBalanceSnapshot.update({
    where: { id: snapshotId },
    data: {
      snapshotType: "baseline",
      isActive: true,
    },
  });

  return updated;
}

/**
 * 删除一个 snapshot（级联删除 rows）。
 * reconcile snapshot 可直接删；active baseline 必须阻止。
 */
export async function deleteSnapshot(snapshotId: number) {
  const snapshot = await prisma.financeBalanceSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new Error("Snapshot 不存在");
  if (snapshot.isActive) {
    throw new Error("不能删除 active baseline snapshot。请先选择新的 baseline，再删除旧基准。");
  }

  await prisma.financeBalanceSnapshot.delete({ where: { id: snapshotId } });
  return snapshot;
}
