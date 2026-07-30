import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const companyCode = z.string().trim().min(1).max(64);
const optionalText = z.string().trim().min(1).max(2000).nullish();
const id = z.coerce.number().int().positive();
const version = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "日期必须是有效的 YYYY-MM-DD");
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const money = z.coerce.number().finite().min(-1e15).max(1e15);
const positiveMoney = z.coerce.number().finite().positive().max(1e15);
const rate = z.coerce.number().finite().min(0).max(1);
const dayCountConvention = z.enum(["actual_365", "actual_360", "30_360"]);
const source = {
  sourceKind: optionalText,
  sourceReleaseId: optionalText,
  sourceSha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).nullish(),
  sourceFile: optionalText,
  sourceSheet: optionalText,
  sourceRow: id.nullish(),
  sourceRange: optionalText,
  sourceKey: optionalText,
};
const company = { companyCode };
const periodScope = {
  companyCode,
  year: z.coerce.number().int().min(2000).max(2099),
  month: z.coerce.number().int().min(1).max(12),
  periodId: id,
};

export const treasuryScopeSchema = z.object({
  companyCode,
  year: z.coerce.number().int().min(2000).max(2099),
  month: z.coerce.number().int().min(1).max(12),
});

const bankAccount = z.object({
  ...company,
  ...source,
  sourceSystem: text,
  sourceLedger: text,
  sourceKey: text,
  sourceCode: optionalText,
  sourceName: text,
  accountId: id.nullish(),
  accountYear: z.coerce.number().int().min(2000).max(2099).nullish(),
  accountNo: optionalText,
  bankName: optionalText,
  currencyCode: currency.nullish(),
  openedOn: date.nullish(),
  closedOn: date.nullish(),
  isActive: z.boolean(),
});

const reconciliationItem = z.object({
  ...source,
  id: id.optional(),
  version: version.optional(),
  voucherItemId: id.nullish(),
  itemKind: z.enum(["bank_adjustment", "ledger_adjustment"]),
  occurredOn: date.nullish(),
  referenceNo: optionalText,
  description: text,
  amount: money.refine((value) => value !== 0, "未达项金额不能为零"),
  clearedOn: date.nullish(),
  status: z.enum(["open", "cleared", "review"]),
});

const bankReconciliation = z.object({
  ...periodScope,
  ...source,
  bankAccountId: id,
  statementDate: date,
  statementEndingBalance: money,
  ledgerEndingBalance: money,
  status: z.enum(["draft", "prepared", "reconciled", "blocked"]),
  conclusion: optionalText,
  evidenceRef: optionalText,
  items: z.array(reconciliationItem).max(1000),
});

const rateTerm = z.object({
  ...source,
  id: id.optional(),
  effectiveFrom: date,
  effectiveThrough: date.nullish(),
  annualRate: rate,
  spreadRate: rate.nullish(),
  rateKind: z.enum(["fixed", "floating"]),
  benchmark: optionalText,
  dayCountConvention,
});

const loan = z.object({
  ...company,
  ...source,
  lenderPartyId: id,
  identityKey: text,
  loanNo: text,
  name: text,
  currencyCode: currency,
  contractPrincipalAmount: positiveMoney,
  startOn: date,
  endOn: date.nullish(),
  status: z.enum(["draft", "active", "settled", "cancelled"]),
  note: optionalText,
  rateTerms: z.array(rateTerm).min(1).max(200),
});

const principalEvent = z.object({
  ...periodScope,
  ...source,
  loanId: id,
  voucherItemId: id.nullish(),
  eventKind: z.enum(["drawdown", "repayment", "reversal"]),
  occurredOn: date,
  amount: positiveMoney,
  referenceNo: optionalText,
  note: optionalText,
  reversesEventId: id.nullish(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

const interestLine = z.object({
  ...source,
  id: id.optional(),
  lineNo: id,
  accrualFrom: date,
  accrualThrough: date,
  principalBasis: z.coerce.number().finite().nonnegative().max(1e15),
  annualRate: rate,
  dayCount: z.coerce.number().int().positive().max(366),
  sourceReportedInterestAmount: money.nullish(),
  note: optionalText,
});
const voucherLink = z.object({
  ...source,
  id: id.optional(),
  voucherItemId: id,
  linkKind: z.enum(["accrual", "payment", "reversal"]),
  amount: positiveMoney,
  note: optionalText,
});
const interestWorkpaper = z.object({
  ...periodScope,
  ...source,
  loanId: id,
  status: z.enum(["draft", "prepared", "reconciled", "blocked"]),
  dayCountConvention,
  note: optionalText,
  lines: z.array(interestLine).min(1).max(1000),
  voucherLinks: z.array(voucherLink).max(1000),
});

export const treasuryCreateSchema = z.discriminatedUnion("kind", [
  bankAccount.extend({ kind: z.literal("bank_account_create") }),
  bankReconciliation.extend({ kind: z.literal("bank_reconciliation_create") }),
  loan.extend({ kind: z.literal("loan_create") }),
  principalEvent.extend({ kind: z.literal("principal_event_append") }),
  interestWorkpaper.extend({ kind: z.literal("interest_workpaper_create") }),
]);

export const treasuryUpdateSchema = z.discriminatedUnion("kind", [
  bankAccount.extend({ kind: z.literal("bank_account_update"), id, version }),
  bankReconciliation.extend({ kind: z.literal("bank_reconciliation_update"), id, version }),
  loan.extend({ kind: z.literal("loan_update"), id, version }),
  interestWorkpaper.extend({ kind: z.literal("interest_workpaper_update"), id, version }),
]);
