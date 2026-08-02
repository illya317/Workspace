import path from "node:path";

import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sourcePath = z.string().min(1).refine(
  (value) => !path.isAbsolute(value) && !value.includes("\\"),
  "来源路径必须相对 payload 目录",
);
const sourceTrace = z.object({
  sourceSheet: z.string().min(1),
  sourceRow: z.number().int().positive().nullish(),
  sourceRange: z.string().min(1).nullish(),
  sourceKey: z.string().min(1),
}).strict();
const rateTerm = sourceTrace.extend({
  effectiveFrom: date,
  effectiveThrough: date.nullish(),
  annualRate: z.number().nonnegative().max(1),
  dayCountConvention: z.enum(["actual_365", "actual_360", "30_360"]),
}).strict();
const principalEvent = sourceTrace.extend({
  occurredOn: date,
  amount: z.number().positive(),
  sourceRange: z.string().min(1),
}).strict();
const interestLine = sourceTrace.extend({
  sourceRow: z.number().int().positive(),
  sourceRange: z.string().min(1),
  lineNo: z.number().int().positive(),
  accrualFrom: date,
  accrualThrough: date,
  principalBasis: z.number().nonnegative(),
  annualRate: z.number().nonnegative().max(1),
}).strict();
const voucherReference = z.object({
  voucherNo: z.string().min(1),
  accountCode: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  debit: z.number().positive(),
}).strict();
const loan = sourceTrace.extend({
  lenderFullName: z.string().min(1),
  identityKey: z.string().min(1),
  loanNo: z.string().min(1),
  name: z.string().min(1),
  contractPrincipalAmount: z.number().positive(),
  startOn: date,
  rateTerms: z.array(rateTerm).min(1),
  principalEvents: z.array(principalEvent).min(1),
  workpaper: sourceTrace.extend({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    dayCountConvention: z.enum(["actual_365", "actual_360", "30_360"]),
    lines: z.array(interestLine).min(1),
    voucherReference,
    expectedCalculatedAmount: z.number().nonnegative(),
  }).strict(),
}).strict();
const physicalCountLine = z.object({
  sourceRow: z.number().int().positive(),
  itemCode: z.string().min(1),
  itemName: z.string().min(1),
  specification: z.string().min(1).nullish(),
  baseUnit: z.string().min(1),
  batchNo: z.string().min(1).nullish(),
  quantity: z.number().nonnegative(),
}).strict();
const payloadSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("finance-june-close-cutover"),
  actorUsername: z.string().min(1),
  sourceFiles: z.array(z.object({ path: sourcePath, sha256 }).strict()).min(1),
  assetImports: z.array(z.object({
    companyCode: z.string().min(1),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    workbookFile: sourcePath,
    approvalConfigFile: sourcePath,
  }).strict()),
  inventoryWorkbookImports: z.array(z.object({ companyCode: z.string().min(1), workbookFile: sourcePath }).strict()),
  physicalCountImports: z.array(z.object({
    companyCode: z.string().min(1),
    sourceFile: sourcePath,
    sourceSheet: z.string().min(1),
    sourceSha256: sha256,
    stocktakeNo: z.string().min(1),
    stocktakeDate: date,
    lines: z.array(physicalCountLine).min(1),
  }).strict()),
  treasury: z.object({
    companyCode: z.string().min(1),
    sourceFile: sourcePath,
    sourceSha256: sha256,
    loans: z.array(loan).min(1),
  }).strict(),
  closeScopes: z.array(z.object({
    companyCode: z.string().min(1),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
  }).strict()).min(1),
}).strict();

export type FinanceJuneCloseCutoverPayload = z.infer<typeof payloadSchema>;
export type FinanceJuneCloseSourceTrace = z.infer<typeof sourceTrace>;
export type FinanceJuneCloseVoucherReference = z.infer<typeof voucherReference>;

export function parseFinanceJuneCloseCutoverPayload(raw: unknown) {
  return payloadSchema.parse(raw);
}
