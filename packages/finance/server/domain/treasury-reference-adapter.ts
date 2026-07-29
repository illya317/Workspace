import { prisma } from "@workspace/platform/server/prisma";

import type { TreasuryValidationDeps } from "./treasury-validation";

export const treasuryValidationDeps: TreasuryValidationDeps = {
  company: (id) => prisma.company.findUnique({ where: { id }, select: { id: true, code: true, isActive: true } }),
  period: (id) => prisma.financePeriod.findUnique({ where: { id }, select: { id: true, companyCode: true, year: true, month: true, isClosed: true } }),
  bankAccount: async (id) => {
    const row = await prisma.financeBankAccount.findUnique({ where: { id }, select: { id: true, companyCode: true, version: true, isActive: true } });
    return row ? { ...row, status: row.isActive ? "active" : "inactive" } : null;
  },
  reconciliation: async (id) => {
    const row = await prisma.financeBankReconciliation.findUnique({ where: { id }, select: { id: true, version: true, status: true, bankAccount: { select: { companyCode: true } } } });
    return row ? { id: row.id, version: row.version, status: row.status, companyCode: row.bankAccount.companyCode } : null;
  },
  loan: async (id) => {
    const row = await prisma.financeLoan.findUnique({ where: { id }, select: { id: true, version: true, status: true, currencyCode: true, startOn: true, endOn: true, company: { select: { code: true } } } });
    return row ? { ...row, companyCode: row.company.code } : null;
  },
  interestWorkpaper: async (id) => {
    const row = await prisma.financeInterestWorkpaper.findUnique({ where: { id }, select: { id: true, version: true, status: true, loan: { select: { company: { select: { code: true } } } } } });
    return row ? { id: row.id, version: row.version, status: row.status, companyCode: row.loan.company.code } : null;
  },
  partyExists: async (id) => Boolean(await prisma.party.findUnique({ where: { id }, select: { id: true } })),
  account: (id) => prisma.financeAccount.findUnique({ where: { id }, select: { id: true, companyCode: true, year: true, isActive: true } }),
  voucherItems: async (ids) => ids.length === 0 ? [] : prisma.financeVoucherItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, voucher: { select: { companyCode: true } } },
  }).then((rows) => rows.map((row) => ({ id: row.id, companyCode: row.voucher.companyCode }))),
  principalEvent: (id) => prisma.financeLoanPrincipalEvent.findUnique({ where: { id }, select: { id: true, loanId: true, eventKind: true, amount: true, reversesEventId: true, idempotencyKey: true } }),
  principalEventByKey: (key) => prisma.financeLoanPrincipalEvent.findUnique({ where: { idempotencyKey: key }, select: { id: true, loanId: true, eventKind: true, amount: true, reversesEventId: true, idempotencyKey: true } }),
  eventWasReversed: async (id) => Boolean(await prisma.financeLoanPrincipalEvent.findFirst({ where: { reversesEventId: id }, select: { id: true } })),
};
