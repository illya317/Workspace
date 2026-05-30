import { prisma } from "@/lib/prisma";
import { getActiveVersion } from "@/server/services/finance/budget/budget-version";

export async function getBudgetAnalysis(year: number, companyCode?: string) {
  const activeVersion = await getActiveVersion(year, companyCode);
  if (!activeVersion) {
    return { hasBudget: false as const };
  }

  const [deptAgg, rdAgg] = await Promise.all([
    prisma.financeBudgetDept.aggregate({
      where: { versionId: activeVersion.id },
      _sum: { total: true },
    }),
    prisma.financeBudgetRd.aggregate({
      where: { versionId: activeVersion.id },
      _sum: { total: true },
    }),
  ]);

  return {
    hasBudget: true as const,
    version: activeVersion,
    deptTotal: deptAgg._sum.total ?? 0,
    rdTotal: rdAgg._sum.total ?? 0,
  };
}
