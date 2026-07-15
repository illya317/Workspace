import { prisma } from "@workspace/platform/server/prisma";

export interface StatementWorkpaperKey {
  companyCode: string;
  year: number;
  month: number;
  reportType: string;
}

export function selectSubmittedStatementWorkpaper<T extends { status: string }>(
  workpaper: T | null | undefined,
): T | null {
  return workpaper?.status === "submitted" ? workpaper : null;
}

export async function loadSubmittedStatementWorkpaper(key: StatementWorkpaperKey) {
  const workpaper = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: key },
    include: { lines: true },
  });
  return selectSubmittedStatementWorkpaper(workpaper);
}

export async function hasSubmittedStatementWorkpaper(key: StatementWorkpaperKey) {
  const workpaper = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: key },
    select: { id: true, status: true },
  });
  return Boolean(selectSubmittedStatementWorkpaper(workpaper));
}
