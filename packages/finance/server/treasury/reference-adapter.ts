import { prisma } from "@workspace/platform/server/prisma";
import type { DayCountConvention } from "../../types/treasury";
import type { TreasuryValidationDependencies } from "./validation-types";

const principalEventSelect = {
  id: true,
  loanId: true,
  voucherItemId: true,
  eventKind: true,
  occurredOn: true,
  amount: true,
  referenceNo: true,
  note: true,
  reversesEventId: true,
  idempotencyKey: true,
  sourceKind: true,
  sourceReleaseId: true,
  sourceSha256: true,
  sourceFile: true,
  sourceSheet: true,
  sourceRow: true,
  sourceRange: true,
  sourceKey: true,
} as const;

export const defaultTreasuryValidationDependencies: Required<TreasuryValidationDependencies> = {
  findCompanyByCode: (code) => prisma.company.findUnique({ where: { code }, select: { id: true, code: true, isActive: true } }),
  findPeriod: (id) => prisma.financePeriod.findUnique({
    where: { id }, select: { id: true, companyCode: true, year: true, month: true, startDate: true, endDate: true, isClosed: true },
  }),
  findAccount: (id) => prisma.financeAccount.findUnique({
    where: { id }, select: { id: true, companyCode: true, year: true, isActive: true },
  }),
  findParty: (id) => prisma.party.findUnique({ where: { id }, select: { id: true } }),
  async findVoucherItems(ids) {
    if (ids.length === 0) return [];
    const rows = await prisma.financeVoucherItem.findMany({
      where: { id: { in: ids } }, select: { id: true, voucher: { select: { companyCode: true, periodId: true } } },
    });
    return rows.map((row) => ({ id: row.id, companyCode: row.voucher.companyCode, periodId: row.voucher.periodId }));
  },
  findBankAccount: (id) => prisma.financeBankAccount.findUnique({
    where: { id }, select: { id: true, companyId: true, companyCode: true, version: true },
  }),
  findReconciliation: (id) => prisma.financeBankReconciliation.findUnique({
    where: { id }, select: { id: true, bankAccountId: true, periodId: true, version: true },
  }),
  async findReconciliationItems(ids) {
    if (ids.length === 0) return [];
    const rows = await prisma.financeBankReconciliationItem.findMany({
      where: { id: { in: ids } }, select: { id: true, reconciliationId: true, version: true },
    });
    return rows.map((row) => ({ id: row.id, parentId: row.reconciliationId, version: row.version }));
  },
  async findLoan(id) {
    const row = await prisma.financeLoan.findUnique({
      where: { id },
      select: {
        id: true, companyId: true, startOn: true, endOn: true, version: true,
        company: { select: { code: true } },
        rateTerms: { select: { dayCountConvention: true } },
      },
    });
    return row ? {
      id: row.id,
      companyId: row.companyId,
      companyCode: row.company.code,
      startOn: row.startOn,
      endOn: row.endOn,
      version: row.version,
      rateTermConventions: row.rateTerms.map((term) => term.dayCountConvention as DayCountConvention),
    } : null;
  },
  async findRateTerms(ids) {
    return ids.length === 0 ? [] : prisma.financeLoanRateTerm.findMany({ where: { id: { in: ids } }, select: { id: true, loanId: true } });
  },
  findPrincipalEvent: (id) => prisma.financeLoanPrincipalEvent.findUnique({ where: { id }, select: principalEventSelect }),
  findPrincipalEventByIdempotencyKey: (idempotencyKey) => prisma.financeLoanPrincipalEvent.findUnique({
    where: { idempotencyKey }, select: principalEventSelect,
  }),
  async hasReversal(eventId) {
    return Boolean(await prisma.financeLoanPrincipalEvent.findFirst({ where: { reversesEventId: eventId }, select: { id: true } }));
  },
  findWorkpaper: (id) => prisma.financeInterestWorkpaper.findUnique({
    where: { id }, select: { id: true, loanId: true, periodId: true, version: true },
  }),
  async findWorkpaperLines(ids) {
    if (ids.length === 0) return [];
    const rows = await prisma.financeInterestWorkpaperLine.findMany({ where: { id: { in: ids } }, select: { id: true, workpaperId: true } });
    return rows.map((row) => ({ id: row.id, parentId: row.workpaperId }));
  },
  async findVoucherLinks(ids) {
    if (ids.length === 0) return [];
    const rows = await prisma.financeInterestVoucherLink.findMany({ where: { id: { in: ids } }, select: { id: true, workpaperId: true } });
    return rows.map((row) => ({ id: row.id, parentId: row.workpaperId }));
  },
};
