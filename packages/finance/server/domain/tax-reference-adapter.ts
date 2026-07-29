import { prisma } from "@workspace/platform/server/prisma";

import type { TaxValidationDeps } from "./tax-validation";

export const taxValidationDeps: TaxValidationDeps = {
  company: (id) => prisma.company.findUnique({ where: { id }, select: { id: true, code: true, isActive: true } }),
  period: (id) => prisma.financePeriod.findUnique({ where: { id }, select: { id: true, companyCode: true, year: true, month: true, isClosed: true } }),
  taxType: (id) => prisma.financeTaxType.findUnique({ where: { id }, select: { id: true, isActive: true, jurisdiction: true } }),
  partyExists: async (id) => Boolean(await prisma.party.findUnique({ where: { id }, select: { id: true } })),
  registration: async (id) => {
    const row = await prisma.financeTaxRegistration.findUnique({ where: { id }, select: { id: true, version: true, status: true, company: { select: { code: true } } } });
    return row ? { ...row, companyCode: row.company.code } : null;
  },
  workpaper: async (id) => {
    const row = await prisma.financeTaxWorkpaper.findUnique({ where: { id }, select: { id: true, version: true, status: true, registration: { select: { company: { select: { code: true } } } } } });
    return row ? { ...row, companyCode: row.registration.company.code } : null;
  },
  filing: async (id) => {
    const row = await prisma.financeTaxFiling.findUnique({ where: { id }, select: { id: true, version: true, status: true, currencyCode: true, registration: { select: { company: { select: { code: true } } } } } });
    return row ? { ...row, companyCode: row.registration.company.code } : null;
  },
  filings: async (ids) => ids.length === 0 ? [] : prisma.financeTaxFiling.findMany({
    where: { id: { in: ids } },
    select: { id: true, currencyCode: true, registration: { select: { company: { select: { code: true } } } } },
  }).then((rows) => rows.map((row) => ({ id: row.id, currencyCode: row.currencyCode, companyCode: row.registration.company.code }))),
  voucherItems: async (ids) => ids.length === 0 ? [] : prisma.financeVoucherItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, voucher: { select: { companyCode: true } } },
  }).then((rows) => rows.map((row) => ({ id: row.id, companyCode: row.voucher.companyCode }))),
  paymentByKey: async (key) => {
    const row = await prisma.financeTaxPayment.findUnique({ where: { idempotencyKey: key }, select: { id: true, paymentKind: true, amount: true, currencyCode: true, reversesPaymentId: true, company: { select: { code: true } } } });
    return row ? { ...row, companyCode: row.company.code } : null;
  },
  payment: async (id) => {
    const row = await prisma.financeTaxPayment.findUnique({ where: { id }, select: { id: true, paymentKind: true, amount: true, currencyCode: true, reversesPaymentId: true, company: { select: { code: true } } } });
    return row ? { ...row, companyCode: row.company.code } : null;
  },
  paymentWasReversed: async (id) => Boolean(await prisma.financeTaxPayment.findFirst({ where: { reversesPaymentId: id }, select: { id: true } })),
};
