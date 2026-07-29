import { prisma } from "@workspace/platform/server/prisma";
import type { FinanceCloseScope } from "../../types/close";
import type { FinanceCloseWorkpaperValidationDependencies } from "./workpaper-validation";

export const financeCloseWorkpaperValidationDependencies: FinanceCloseWorkpaperValidationDependencies = {
  resolveScope: async (scope: FinanceCloseScope) => {
    const company = await prisma.company.findUnique({ where: { code: scope.companyCode }, select: { id: true, code: true, isActive: true } });
    if (!company?.isActive) return null;
    const period = await prisma.financePeriod.findUnique({
      where: { companyCode_year_month: scope },
      select: { id: true, companyCode: true, year: true, month: true, isClosed: true },
    });
    if (!period || period.companyCode !== company.code) return null;
    return { ...scope, companyId: company.id, periodId: period.id, isPeriodClosed: period.isClosed };
  },
  userCanLogin: async (userId) => Boolean(await prisma.user.findFirst({ where: { id: userId, canLogin: true }, select: { id: true } })),
  findWorkpaper: (scope, taskKey) => prisma.financeCloseWorkpaper.findUnique({
    where: { companyId_periodId_taskKey: { companyId: scope.companyId, periodId: scope.periodId, taskKey } },
  }),
  findEvent: (idempotencyKey) => prisma.financeCloseWorkpaperEvent.findUnique({
    where: { idempotencyKey },
    select: { workpaperId: true, eventKind: true, requestFingerprint: true },
  }),
  findVouchers: (ids) => ids.length === 0 ? Promise.resolve([]) : prisma.financeVoucher.findMany({
    where: { id: { in: ids } },
    select: { id: true, companyCode: true, periodId: true, status: true },
  }),
  findVoucherItems: (ids) => ids.length === 0 ? Promise.resolve([]) : prisma.financeVoucherItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      voucher: {
        select: {
          companyCode: true,
          status: true,
          periodId: true,
          period: { select: { companyCode: true, year: true, month: true } },
        },
      },
    },
  }),
};
