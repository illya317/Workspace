import { prisma } from "@workspace/platform/server/prisma";

import type { TaxPaymentFact, TaxValidationDependencies } from "./validation";

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function paymentFact(row: null | {
  id: number;
  paymentKind: string;
  paidOn: Date;
  amount: unknown;
  currencyCode: string;
  paymentReference: string | null;
  note: string | null;
  reversesPaymentId: number | null;
  sourceKind: string | null;
  sourceReleaseId: string | null;
  sourceSha256: string | null;
  sourceFile: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  sourceRange: string | null;
  sourceKey: string | null;
  company: { code: string };
  allocations: Array<{ filingId: number; voucherItemId: number | null; allocatedAmount: unknown }>;
}): TaxPaymentFact | null {
  return row ? {
    id: row.id,
    companyCode: row.company.code,
    paymentKind: row.paymentKind,
    paidOn: dateOnly(row.paidOn),
    amount: Number(row.amount),
    currencyCode: row.currencyCode,
    paymentReference: row.paymentReference,
    note: row.note,
    reversesPaymentId: row.reversesPaymentId,
    sourceKind: row.sourceKind,
    sourceReleaseId: row.sourceReleaseId,
    sourceSha256: row.sourceSha256,
    sourceFile: row.sourceFile,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    sourceRange: row.sourceRange,
    sourceKey: row.sourceKey,
    allocations: row.allocations.map((allocation) => ({ ...allocation, allocatedAmount: Number(allocation.allocatedAmount) })),
  } : null;
}

export const taxValidationDependencies: TaxValidationDependencies = {
  findCompanyByCode: (code) => prisma.company.findUnique({ where: { code }, select: { id: true, code: true, isActive: true } }),
  findPeriod: (id) => prisma.financePeriod.findUnique({
    where: { id },
    select: { id: true, companyCode: true, year: true, month: true, isClosed: true },
  }),
  findTaxType: (id) => prisma.financeTaxType.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  partyExists: async (id) => Boolean(await prisma.party.findUnique({ where: { id }, select: { id: true } })),
  findRegistration: async (id) => {
    const row = await prisma.financeTaxRegistration.findUnique({
      where: { id },
      select: {
        id: true,
        version: true,
        status: true,
        effectiveFrom: true,
        effectiveThrough: true,
        company: { select: { code: true } },
      },
    });
    return row ? {
      id: row.id,
      companyCode: row.company.code,
      version: row.version,
      status: row.status,
      effectiveFrom: dateOnly(row.effectiveFrom),
      effectiveThrough: row.effectiveThrough ? dateOnly(row.effectiveThrough) : null,
    } : null;
  },
  findWorkpaper: async (id) => {
    const row = await prisma.financeTaxWorkpaper.findUnique({
      where: { id },
      select: { id: true, version: true, status: true, registration: { select: { company: { select: { code: true } } } } },
    });
    return row ? { id: row.id, companyCode: row.registration.company.code, version: row.version, status: row.status } : null;
  },
  findFiling: async (id) => {
    const row = await prisma.financeTaxFiling.findUnique({
      where: { id },
      select: { id: true, version: true, status: true, currencyCode: true, registration: { select: { company: { select: { code: true } } } } },
    });
    return row ? {
      id: row.id,
      companyCode: row.registration.company.code,
      version: row.version,
      status: row.status,
      currencyCode: row.currencyCode,
    } : null;
  },
  findFilings: async (ids) => {
    if (ids.length === 0) return [];
    const rows = await prisma.financeTaxFiling.findMany({
      where: { id: { in: ids } },
      select: { id: true, version: true, status: true, currencyCode: true, registration: { select: { company: { select: { code: true } } } } },
    });
    return rows.map((row) => ({
      id: row.id,
      companyCode: row.registration.company.code,
      version: row.version,
      status: row.status,
      currencyCode: row.currencyCode,
    }));
  },
  findAccrualLines: (ids) => ids.length === 0
    ? Promise.resolve([])
    : prisma.financeTaxAccrualLine.findMany({ where: { id: { in: ids } }, select: { id: true, workpaperId: true } }),
  findVoucherItems: async (ids) => {
    if (ids.length === 0) return [];
    const rows = await prisma.financeVoucherItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        voucher: {
          select: {
            companyCode: true,
            periodId: true,
            period: { select: { year: true, month: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      companyCode: row.voucher.companyCode,
      periodId: row.voucher.periodId,
      year: row.voucher.period.year,
      month: row.voucher.period.month,
    }));
  },
  findPaymentByIdempotencyKey: async (key) => paymentFact(await prisma.financeTaxPayment.findUnique({
    where: { idempotencyKey: key },
    include: { company: { select: { code: true } }, allocations: true },
  })),
  findPayment: async (id) => paymentFact(await prisma.financeTaxPayment.findUnique({
    where: { id },
    include: { company: { select: { code: true } }, allocations: true },
  })),
  paymentWasReversed: async (id) => Boolean(await prisma.financeTaxPayment.findFirst({ where: { reversesPaymentId: id }, select: { id: true } })),
  filingHasAllocations: async (id) => Boolean(await prisma.financeTaxPaymentAllocation.findFirst({ where: { filingId: id }, select: { id: true } })),
};
