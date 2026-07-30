import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const optionalText = z.string().trim().min(1).max(2000).nullish();
const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const currency = z.string().trim().regex(/^[A-Z]{3}$/);
const source = {
  sourceKind: optionalText, sourceReleaseId: optionalText, sourceSha256: optionalText,
  sourceFile: optionalText, sourceSheet: optionalText, sourceRow: id.optional(),
  sourceRange: optionalText, sourceKey: optionalText,
};
const period = { companyCode: text, year: z.coerce.number().int().min(2000).max(2099), month: z.coerce.number().int().min(1).max(12), periodId: id };

export const taxScopeSchema = z.object({
  companyCode: text,
  year: z.coerce.number().int().min(2000).max(2099),
  month: z.coerce.number().int().min(1).max(12),
});

const registration = z.object({
  ...source, companyCode: text, taxTypeId: id, authorityName: optionalText,
  registrationNo: text, jurisdiction: text,
  filingFrequency: z.enum(["monthly", "quarterly", "annual", "event"]),
  effectiveFrom: date, effectiveThrough: date.nullish(),
  status: z.enum(["draft", "active", "suspended", "ended"]),
});
const accrualLine = z.object({
  ...source, id: id.optional(), voucherItemId: id.nullish(), lineNo: id,
  recognitionOn: date.nullish(), description: text, taxBaseAmount: z.coerce.number().finite().nullish(),
  taxRate: z.coerce.number().finite().nullish(), quantity: z.coerce.number().finite().nullish(),
  unitRate: z.coerce.number().finite().nullish(), divisor: z.coerce.number().finite().nullish(),
  sourceReportedTaxAmount: z.coerce.number().finite().nullish(),
});
const workpaper = z.object({
  ...source, ...period, registrationId: id, status: z.enum(["draft", "prepared", "reconciled", "blocked"]),
  note: optionalText,
  accrualLines: z.array(accrualLine).min(1).max(1000),
});
const filing = z.object({
  ...source, ...period, registrationId: id, filingReference: optionalText, filedOn: date.nullish(),
  status: z.enum(["draft", "filed", "accepted", "amended", "cancelled"]), currencyCode: currency,
  sourceReportedDeclaredAmount: z.coerce.number().finite().nullish(),
  sourceReportedPayableAmount: z.coerce.number().finite().nullish(), note: optionalText,
});
const allocation = z.object({
  ...source, filingId: id, voucherItemId: id.nullish(), allocatedAmount: z.coerce.number().positive(),
});
const payment = z.object({
  ...source, companyCode: text, paymentKind: z.enum(["payment", "refund", "reversal"]),
  paidOn: date, amount: z.coerce.number().positive(), currencyCode: currency,
  paymentReference: optionalText, note: optionalText, reversesPaymentId: id.nullish(),
  idempotencyKey: text, allocations: z.array(allocation).max(1000),
});

export const taxCreateSchema = z.discriminatedUnion("kind", [
  registration.extend({ kind: z.literal("registration_create") }),
  workpaper.extend({ kind: z.literal("workpaper_create") }),
  filing.extend({ kind: z.literal("filing_create") }),
  payment.extend({ kind: z.literal("payment_append") }),
]);
export const taxUpdateSchema = z.discriminatedUnion("kind", [
  registration.extend({ kind: z.literal("registration_update"), id, version: id }),
  workpaper.extend({ kind: z.literal("workpaper_update"), id, version: id }),
  filing.extend({ kind: z.literal("filing_update"), id, version: id }),
]);
