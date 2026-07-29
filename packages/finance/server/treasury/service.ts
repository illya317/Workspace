import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type {
  BankAccountWriteInput, BankReconciliationItemInput, DayCountConvention,
  InterestVoucherLinkInput, InterestWorkpaperLineInput, LoanRateTermInput,
  TreasuryScope, TreasuryWorkspaceDto,
  TreasuryBankAccountDto, TreasuryBankReconciliationDto, TreasuryInterestWorkpaperDto,
  TreasuryLoanDto, TreasuryPrincipalEventDto,
} from "../../types/treasury";
import { calculateBankReconciliation, calculateInterestWorkpaper, calculateLoanPrincipalBalance, roundMoney } from "./calculations";
import { resolveUniqueLoanDayCountConvention } from "./conventions";
import { date, dateDto, timestampDto, traceData, traceDto } from "./serialization";
import { principalEventMatchesInput, type TreasuryCreateCommand, type TreasuryUpdateCommand } from "./validation";
import { validateTreasuryCreatePersistenceCommand, validateTreasuryUpdatePersistenceCommand } from "../domain/treasury-validation";
import { buildTreasuryBlockers } from "./workspace-blockers";

const voucherItemDisplay = { select: { sortOrder: true, voucher: { select: { voucherNo: true } }, account: { select: { code: true, name: true } } } } as const;
const principalEventInclude = { voucherItem: voucherItemDisplay } satisfies Prisma.FinanceLoanPrincipalEventInclude;
const bankAccountInclude = { account: { select: { year: true, code: true, name: true } } } satisfies Prisma.FinanceBankAccountInclude;
const reconciliationInclude = { items: { include: { voucherItem: voucherItemDisplay }, orderBy: { id: "asc" as const } } } satisfies Prisma.FinanceBankReconciliationInclude;
const loanInclude = {
  company: { select: { code: true } },
  lenderParty: { select: { name: true } },
  rateTerms: { orderBy: { effectiveFrom: "asc" as const } },
  principalEvents: { include: { voucherItem: voucherItemDisplay }, orderBy: [{ occurredOn: "asc" as const }, { recordedAt: "asc" as const }] },
} satisfies Prisma.FinanceLoanInclude;
const workpaperInclude = {
  loan: { include: { rateTerms: { orderBy: { effectiveFrom: "asc" as const } } } },
  lines: { orderBy: { lineNo: "asc" as const } },
  voucherLinks: { include: { voucherItem: voucherItemDisplay }, orderBy: { id: "asc" as const } },
} satisfies Prisma.FinanceInterestWorkpaperInclude;

type BankAccountRow = Prisma.FinanceBankAccountGetPayload<{ include: typeof bankAccountInclude }>;
type ReconciliationRow = Prisma.FinanceBankReconciliationGetPayload<{ include: typeof reconciliationInclude }>;
type LoanRow = Prisma.FinanceLoanGetPayload<{ include: typeof loanInclude }>;
type PrincipalEventRow = Prisma.FinanceLoanPrincipalEventGetPayload<{ include: typeof principalEventInclude }>;
type WorkpaperRow = Prisma.FinanceInterestWorkpaperGetPayload<{ include: typeof workpaperInclude }>;
function bankAccountData(input: BankAccountWriteInput, companyId: number) {
  return {
    companyId,
    companyCode: input.companyCode,
    accountId: input.accountId ?? null,
    sourceSystem: input.sourceSystem,
    sourceLedger: input.sourceLedger,
    sourceKey: input.sourceKey,
    sourceCode: input.sourceCode ?? null,
    sourceName: input.sourceName,
    accountNo: input.accountNo ?? null,
    bankName: input.bankName ?? null,
    currencyCode: input.currencyCode ?? null,
    openedOn: date(input.openedOn),
    closedOn: date(input.closedOn),
    isActive: input.isActive,
    ...traceData(input),
  };
}

function reconciliationItemData(input: BankReconciliationItemInput) {
  return {
    voucherItemId: input.voucherItemId ?? null,
    itemKind: input.itemKind,
    occurredOn: date(input.occurredOn),
    referenceNo: input.referenceNo ?? null,
    description: input.description,
    amount: input.amount,
    clearedOn: date(input.clearedOn),
    status: input.status,
    ...traceData(input),
  };
}

function rateTermData(input: LoanRateTermInput) {
  return {
    effectiveFrom: date(input.effectiveFrom)!,
    effectiveThrough: date(input.effectiveThrough),
    annualRate: input.annualRate,
    spreadRate: input.spreadRate ?? null,
    rateKind: input.rateKind,
    benchmark: input.benchmark ?? null,
    dayCountConvention: input.dayCountConvention,
    ...traceData(input),
  };
}

function interestLineData(input: InterestWorkpaperLineInput) {
  return {
    lineNo: input.lineNo,
    accrualFrom: date(input.accrualFrom)!,
    accrualThrough: date(input.accrualThrough)!,
    principalBasis: input.principalBasis,
    annualRate: input.annualRate,
    dayCount: input.dayCount,
    sourceReportedInterestAmount: input.sourceReportedInterestAmount ?? null,
    note: input.note ?? null,
    ...traceData(input),
  };
}

function voucherLinkData(input: InterestVoucherLinkInput) {
  return {
    voucherItemId: input.voucherItemId,
    linkKind: input.linkKind,
    amount: input.amount,
    note: input.note ?? null,
    ...traceData(input),
  };
}

function voucherItemName(row: { sortOrder: number; voucher: { voucherNo: string }; account: { code: string; name: string } } | null) {
  return row ? `${row.voucher.voucherNo} · 分录 ${row.sortOrder + 1}` : null;
}

function toBankAccountDto(row: BankAccountRow): TreasuryBankAccountDto {
  return {
    id: row.id,
    version: row.version,
    companyId: row.companyId,
    companyCode: row.companyCode,
    accountId: row.accountId,
    accountYear: row.account?.year ?? null,
    accountCode: row.account?.code ?? null,
    accountName: row.account?.name ?? null,
    sourceSystem: row.sourceSystem,
    sourceLedger: row.sourceLedger,
    sourceKey: row.sourceKey,
    sourceCode: row.sourceCode,
    sourceName: row.sourceName,
    accountNo: row.accountNo,
    bankName: row.bankName,
    currencyCode: row.currencyCode,
    openedOn: dateDto(row.openedOn),
    closedOn: dateDto(row.closedOn),
    isActive: row.isActive,
    ...traceDto(row),
    createdAt: timestampDto(row.createdAt),
    updatedAt: timestampDto(row.updatedAt),
  };
}

function toReconciliationDto(row: ReconciliationRow): TreasuryBankReconciliationDto {
  const items = row.items.map((item) => ({
    id: item.id,
    version: item.version,
    voucherItemId: item.voucherItemId,
    voucherItemName: voucherItemName(item.voucherItem),
    itemKind: item.itemKind,
    occurredOn: dateDto(item.occurredOn),
    referenceNo: item.referenceNo,
    description: item.description,
    amount: roundMoney(Number(item.amount)),
    clearedOn: dateDto(item.clearedOn),
    status: item.status,
    ...traceDto(item),
    createdAt: timestampDto(item.createdAt),
    updatedAt: timestampDto(item.updatedAt),
  }));
  return {
    id: row.id,
    version: row.version,
    bankAccountId: row.bankAccountId,
    periodId: row.periodId,
    statementDate: dateDto(row.statementDate)!,
    statementEndingBalance: roundMoney(Number(row.statementEndingBalance)),
    ledgerEndingBalance: roundMoney(Number(row.ledgerEndingBalance)),
    status: row.status,
    conclusion: row.conclusion,
    evidenceRef: row.evidenceRef,
    items,
    calculation: calculateBankReconciliation({
      statementEndingBalance: Number(row.statementEndingBalance),
      ledgerEndingBalance: Number(row.ledgerEndingBalance),
      items,
    }),
    ...traceDto(row),
    createdAt: timestampDto(row.createdAt),
    updatedAt: timestampDto(row.updatedAt),
  };
}

function toPrincipalEventDto(row: PrincipalEventRow): TreasuryPrincipalEventDto {
  return {
    id: row.id,
    loanId: row.loanId,
    voucherItemId: row.voucherItemId,
    voucherItemName: voucherItemName(row.voucherItem),
    eventKind: row.eventKind,
    occurredOn: dateDto(row.occurredOn)!,
    amount: roundMoney(Number(row.amount)),
    referenceNo: row.referenceNo,
    note: row.note,
    reversesEventId: row.reversesEventId,
    idempotencyKey: row.idempotencyKey,
    ...traceDto(row),
    recordedAt: timestampDto(row.recordedAt),
  };
}

function toLoanDto(row: LoanRow): TreasuryLoanDto {
  const principalEvents = row.principalEvents.map(toPrincipalEventDto);
  return {
    id: row.id,
    version: row.version,
    companyId: row.companyId,
    companyCode: row.company.code,
    lenderPartyId: row.lenderPartyId,
    lenderPartyName: row.lenderParty.name,
    identityKey: row.identityKey,
    loanNo: row.loanNo,
    name: row.name,
    currencyCode: row.currencyCode,
    contractPrincipalAmount: roundMoney(Number(row.contractPrincipalAmount)),
    principalBalance: calculateLoanPrincipalBalance(principalEvents),
    startOn: dateDto(row.startOn)!,
    endOn: dateDto(row.endOn),
    status: row.status,
    note: row.note,
    rateTerms: row.rateTerms.map((term) => ({
      id: term.id,
      effectiveFrom: dateDto(term.effectiveFrom)!,
      effectiveThrough: dateDto(term.effectiveThrough),
      annualRate: Number(term.annualRate),
      spreadRate: term.spreadRate == null ? null : Number(term.spreadRate),
      rateKind: term.rateKind,
      benchmark: term.benchmark,
      dayCountConvention: term.dayCountConvention as DayCountConvention,
      ...traceDto(term),
      createdAt: timestampDto(term.createdAt),
    })),
    principalEvents,
    ...traceDto(row),
    createdAt: timestampDto(row.createdAt),
    updatedAt: timestampDto(row.updatedAt),
  };
}

function inferConvention(row: WorkpaperRow): DayCountConvention {
  const convention = resolveUniqueLoanDayCountConvention(row.loan.rateTerms.map((term) => term.dayCountConvention));
  if (!convention) throw new Error("借款合同计息天数口径缺失、不唯一或无效，无法读取利息底稿");
  return convention;
}

function toWorkpaperDto(row: WorkpaperRow): TreasuryInterestWorkpaperDto {
  const dayCountConvention = inferConvention(row);
  const calculation = calculateInterestWorkpaper({
    dayCountConvention,
    lines: row.lines.map((line) => ({
      principalBasis: Number(line.principalBasis),
      annualRate: Number(line.annualRate),
      dayCount: line.dayCount,
      sourceReportedInterestAmount: line.sourceReportedInterestAmount == null ? null : Number(line.sourceReportedInterestAmount),
    })),
    voucherLinks: row.voucherLinks.map((link) => ({ linkKind: link.linkKind, amount: Number(link.amount) })),
  });
  return {
    id: row.id,
    version: row.version,
    loanId: row.loanId,
    periodId: row.periodId,
    status: row.status,
    calculationVersion: row.calculationVersion,
    inputFingerprint: row.inputFingerprint,
    dayCountConvention,
    note: row.note,
    lines: row.lines.map((line, index) => ({
      id: line.id,
      lineNo: line.lineNo,
      accrualFrom: dateDto(line.accrualFrom)!,
      accrualThrough: dateDto(line.accrualThrough)!,
      principalBasis: roundMoney(Number(line.principalBasis)),
      annualRate: Number(line.annualRate),
      dayCount: line.dayCount,
      sourceReportedInterestAmount: line.sourceReportedInterestAmount == null ? null : roundMoney(Number(line.sourceReportedInterestAmount)),
      calculatedAmount: calculation.lines[index].calculatedAmount,
      sourceDifference: calculation.lines[index].sourceDifference,
      note: line.note,
      ...traceDto(line),
      createdAt: timestampDto(line.createdAt),
    })),
    voucherLinks: row.voucherLinks.map((link) => ({
      id: link.id,
      voucherItemId: link.voucherItemId,
      voucherItemName: voucherItemName(link.voucherItem),
      linkKind: link.linkKind,
      amount: roundMoney(Number(link.amount)),
      note: link.note,
      ...traceDto(link),
      createdAt: timestampDto(link.createdAt),
    })),
    calculation: {
      calculatedAmount: calculation.calculatedAmount,
      sourceReportedAmount: calculation.sourceReportedAmount,
      sourceDifference: calculation.sourceDifference,
      voucherAmount: calculation.voucherAmount,
      voucherDifference: calculation.voucherDifference,
    },
    ...traceDto(row),
    createdAt: timestampDto(row.createdAt),
    updatedAt: timestampDto(row.updatedAt),
  };
}

async function loadBankAccount(id: number) {
  const row = await prisma.financeBankAccount.findUnique({ where: { id }, include: bankAccountInclude });
  if (!row) throw new Error("银行账户不存在");
  return toBankAccountDto(row);
}

async function loadReconciliation(id: number) {
  const row = await prisma.financeBankReconciliation.findUnique({ where: { id }, include: reconciliationInclude });
  if (!row) throw new Error("银行对账单不存在");
  return toReconciliationDto(row);
}

async function loadLoan(id: number) {
  const row = await prisma.financeLoan.findUnique({ where: { id }, include: loanInclude });
  if (!row) throw new Error("借款不存在");
  return toLoanDto(row);
}

async function loadWorkpaper(id: number) {
  const row = await prisma.financeInterestWorkpaper.findUnique({ where: { id }, include: workpaperInclude });
  if (!row) throw new Error("利息底稿不存在");
  return toWorkpaperDto(row);
}

export async function executeTreasuryCreate(command: TreasuryCreateCommand) {
  const checked = await validateTreasuryCreatePersistenceCommand(command);
  if (!checked.ok) throw new Error(checked.issue.message);
  command = checked.data;
  const input = command.input;
  if (input.kind === "bank_account_create") {
    const row = await prisma.financeBankAccount.create({ data: bankAccountData(input, command.companyId!), include: bankAccountInclude });
    return toBankAccountDto(row);
  }
  if (input.kind === "bank_reconciliation_create") {
    const row = await prisma.financeBankReconciliation.create({
      data: {
        bankAccountId: input.bankAccountId,
        periodId: input.periodId,
        statementDate: date(input.statementDate)!,
        statementEndingBalance: input.statementEndingBalance,
        ledgerEndingBalance: input.ledgerEndingBalance,
        status: input.status,
        conclusion: input.conclusion ?? null,
        evidenceRef: input.evidenceRef ?? null,
        ...traceData(input),
        items: { create: input.items.map(reconciliationItemData) },
      },
      include: reconciliationInclude,
    });
    return toReconciliationDto(row);
  }
  if (input.kind === "loan_create") {
    const row = await prisma.financeLoan.create({
      data: {
        companyId: command.companyId!,
        lenderPartyId: input.lenderPartyId,
        identityKey: input.identityKey,
        loanNo: input.loanNo,
        name: input.name,
        currencyCode: input.currencyCode,
        contractPrincipalAmount: input.contractPrincipalAmount,
        startOn: date(input.startOn)!,
        endOn: date(input.endOn),
        status: input.status,
        note: input.note ?? null,
        ...traceData(input),
        rateTerms: { create: input.rateTerms.map(rateTermData) },
      },
      include: loanInclude,
    });
    return toLoanDto(row);
  }
  if (input.kind === "principal_event_append") {
    if (command.idempotentPrincipalEventId) {
      const existing = await prisma.financeLoanPrincipalEvent.findUnique({ where: { id: command.idempotentPrincipalEventId }, include: principalEventInclude });
      if (existing) return toPrincipalEventDto(existing);
    }
    const existing = await prisma.financeLoanPrincipalEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: principalEventInclude });
    if (existing) {
      if (!principalEventMatchesInput(existing, input)) throw new Error("幂等键已用于不同的本金事件");
      return toPrincipalEventDto(existing);
    }
    const row = await prisma.financeLoanPrincipalEvent.create({
      data: {
        loanId: input.loanId,
        voucherItemId: input.voucherItemId ?? null,
        eventKind: input.eventKind,
        occurredOn: date(input.occurredOn)!,
        amount: input.amount,
        referenceNo: input.referenceNo ?? null,
        note: input.note ?? null,
        reversesEventId: input.reversesEventId ?? null,
        idempotencyKey: input.idempotencyKey,
        ...traceData(input),
      },
      include: principalEventInclude,
    });
    return toPrincipalEventDto(row);
  }
  const row = await prisma.financeInterestWorkpaper.create({
    data: {
      loanId: input.loanId,
      periodId: input.periodId,
      status: input.status,
      calculationVersion: command.calculation!.calculationVersion,
      inputFingerprint: command.calculation!.inputFingerprint,
      note: input.note ?? null,
      ...traceData(input),
      lines: { create: input.lines.map(interestLineData) },
      voucherLinks: { create: input.voucherLinks.map(voucherLinkData) },
    },
    include: workpaperInclude,
  });
  return toWorkpaperDto(row);
}

async function casUpdate(
  tx: Prisma.TransactionClient,
  delegate: "financeBankAccount" | "financeBankReconciliation" | "financeLoan" | "financeInterestWorkpaper",
  id: number,
  version: number,
  data: object,
) {
  const result = await tx[delegate].updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
  if (result.count !== 1) throw new Error("记录已被其他人修改，请刷新后重试");
}

export async function executeTreasuryUpdate(command: TreasuryUpdateCommand) {
  const checked = await validateTreasuryUpdatePersistenceCommand(command);
  if (!checked.ok) throw new Error(checked.issue.message);
  command = checked.data;
  const input = command.input;
  if (input.kind === "bank_account_update") {
    await casUpdate(prisma, "financeBankAccount", input.id, input.version, bankAccountData(input, command.companyId!));
    return loadBankAccount(input.id);
  }
  if (input.kind === "bank_reconciliation_update") {
    await prisma.$transaction(async (tx) => {
      await casUpdate(tx, "financeBankReconciliation", input.id, input.version, {
        bankAccountId: input.bankAccountId,
        periodId: input.periodId,
        statementDate: date(input.statementDate)!,
        statementEndingBalance: input.statementEndingBalance,
        ledgerEndingBalance: input.ledgerEndingBalance,
        status: input.status,
        conclusion: input.conclusion ?? null,
        evidenceRef: input.evidenceRef ?? null,
        ...traceData(input),
      });
      for (const item of input.items) {
        if (item.id == null) {
          await tx.financeBankReconciliationItem.create({ data: { reconciliationId: input.id, ...reconciliationItemData(item) } });
          continue;
        }
        const updated = await tx.financeBankReconciliationItem.updateMany({
          where: { id: item.id, reconciliationId: input.id, version: item.version },
          data: { ...reconciliationItemData(item), version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new Error("未达项已被其他人修改，请刷新后重试");
      }
    });
    return loadReconciliation(input.id);
  }
  if (input.kind === "loan_update") {
    await prisma.$transaction(async (tx) => {
      await casUpdate(tx, "financeLoan", input.id, input.version, {
        companyId: command.companyId!,
        lenderPartyId: input.lenderPartyId,
        identityKey: input.identityKey,
        loanNo: input.loanNo,
        name: input.name,
        currencyCode: input.currencyCode,
        contractPrincipalAmount: input.contractPrincipalAmount,
        startOn: date(input.startOn)!,
        endOn: date(input.endOn),
        status: input.status,
        note: input.note ?? null,
        ...traceData(input),
      });
      for (const term of input.rateTerms) {
        if (term.id == null) {
          await tx.financeLoanRateTerm.create({ data: { loanId: input.id, ...rateTermData(term) } });
          continue;
        }
        const updated = await tx.financeLoanRateTerm.updateMany({
          where: { id: term.id, loanId: input.id }, data: rateTermData(term),
        });
        if (updated.count !== 1) throw new Error("利率条款不存在或不属于当前借款");
      }
    });
    return loadLoan(input.id);
  }
  await prisma.$transaction(async (tx) => {
    await casUpdate(tx, "financeInterestWorkpaper", input.id, input.version, {
      loanId: input.loanId,
      periodId: input.periodId,
      status: input.status,
      calculationVersion: command.calculation!.calculationVersion,
      inputFingerprint: command.calculation!.inputFingerprint,
      note: input.note ?? null,
      ...traceData(input),
    });
    for (const line of input.lines) {
      if (line.id == null) {
        await tx.financeInterestWorkpaperLine.create({ data: { workpaperId: input.id, ...interestLineData(line) } });
        continue;
      }
      const updated = await tx.financeInterestWorkpaperLine.updateMany({
        where: { id: line.id, workpaperId: input.id }, data: interestLineData(line),
      });
      if (updated.count !== 1) throw new Error("利息行不存在或不属于当前底稿");
    }
    for (const link of input.voucherLinks) {
      if (link.id == null) {
        await tx.financeInterestVoucherLink.create({ data: { workpaperId: input.id, ...voucherLinkData(link) } });
        continue;
      }
      const updated = await tx.financeInterestVoucherLink.updateMany({
        where: { id: link.id, workpaperId: input.id }, data: voucherLinkData(link),
      });
      if (updated.count !== 1) throw new Error("凭证链接不存在或不属于当前底稿");
    }
  });
  return loadWorkpaper(input.id);
}

export async function listTreasuryWorkspace(scope: TreasuryScope): Promise<TreasuryWorkspaceDto> {
  const period = await prisma.financePeriod.findUnique({ where: { companyCode_year_month: scope } });
  const [bankAccounts, loans, reconciliations, workpapers] = await Promise.all([
    prisma.financeBankAccount.findMany({ where: { companyCode: scope.companyCode }, include: bankAccountInclude, orderBy: { id: "asc" } }),
    prisma.financeLoan.findMany({ where: { company: { code: scope.companyCode } }, include: loanInclude, orderBy: { id: "asc" } }),
    period ? prisma.financeBankReconciliation.findMany({ where: { periodId: period.id }, include: reconciliationInclude, orderBy: { id: "asc" } }) : [],
    period ? prisma.financeInterestWorkpaper.findMany({ where: { periodId: period.id }, include: workpaperInclude, orderBy: { id: "asc" } }) : [],
  ]);
  const bankDtos = bankAccounts.map(toBankAccountDto);
  const reconciliationDtos = reconciliations.map(toReconciliationDto);
  const loanDtos = loans.map(toLoanDto);
  const workpaperDtos = workpapers.map(toWorkpaperDto);
  const blockers = buildTreasuryBlockers(scope, Boolean(period), reconciliationDtos, workpaperDtos);
  const evidenceRefs = [...new Set(reconciliationDtos.map((row) => row.evidenceRef).filter((value): value is string => Boolean(value)))];
  return {
    scope: { ...scope, periodId: period?.id ?? null, isClosed: period?.isClosed ?? false },
    bankAccounts: bankDtos,
    bankReconciliations: reconciliationDtos,
    loans: loanDtos,
    interestWorkpapers: workpaperDtos,
    blockers,
    evidenceRefs,
  };
}
