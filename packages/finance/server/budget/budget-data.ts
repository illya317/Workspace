import { prisma } from "@workspace/platform/server/prisma";

export async function loadDeptBudgetFromDb(versionId: number) {
  const rows = await prisma.financeBudgetDept.findMany({
    where: { versionId },
    include: { account: { select: { id: true, code: true, isActive: true } } },
  });
  return rows.map((r) => ({
    dept: r.dept,
    account: r.accountName,
    total: r.total,
    months: [r.month1, r.month2, r.month3, r.month4, r.month5, r.month6, r.month7, r.month8, r.month9, r.month10, r.month11, r.month12],
    expenseType: r.expenseType,
    accountId: r.account?.id ?? null,
    accountCode: r.account?.code ?? null,
    accountActive: r.account?.isActive ?? null,
  }));
}

export async function loadRdBudgetFromDb(versionId: number) {
  const rows = await prisma.financeBudgetRd.findMany({
    where: { versionId },
    include: { account: { select: { id: true, code: true, isActive: true } } },
  });
  return rows.map((r) => ({
    project: r.project,
    category: r.category,
    total: r.total,
    months: [r.month1, r.month2, r.month3, r.month4, r.month5, r.month6, r.month7, r.month8, r.month9, r.month10, r.month11, r.month12],
    accountId: r.account?.id ?? null,
    accountCode: r.account?.code ?? null,
    accountActive: r.account?.isActive ?? null,
  }));
}
