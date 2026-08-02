import { prisma } from "@workspace/platform/server/prisma";

import type { CloseValidationDependencies } from "./validation-dependencies";

export const closeValidationDependencies: CloseValidationDependencies = {
  findCompanyByCode: (code) => prisma.company.findUnique({ where: { code }, select: { id: true, code: true, isActive: true } }),
  findPeriod: ({ companyCode, year, month }) => prisma.financePeriod.findUnique({ where: { companyCode_year_month: { companyCode, year, month } }, select: { id: true, companyCode: true, year: true, month: true, isClosed: true } }),
  findUser: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, canLogin: true } }),
  findRun: (id) => prisma.financeCloseRun.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, periodId: true, status: true, version: true,
      company: { select: { id: true, code: true, isActive: true } },
      period: { select: { id: true, companyCode: true, year: true, month: true, isClosed: true } },
    },
  }),
  findEvent: (idempotencyKey) => prisma.financeCloseEvent.findUnique({
    where: { idempotencyKey },
    select: {
      eventKind: true, requestFingerprint: true,
      run: {
        select: {
          id: true, companyId: true, periodId: true, status: true, version: true,
          company: { select: { id: true, code: true, isActive: true } },
          period: { select: { id: true, companyCode: true, year: true, month: true, isClosed: true } },
        },
      },
    },
  }),
};
