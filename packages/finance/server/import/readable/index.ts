import { z } from "zod";
import { loadReadableArchiveEvidence } from "./archive-evidence";
import { loadT6Batch } from "./t6-adapter";
import { loadTPlusBatch } from "./tplus-adapter";
import { previewReadableBatch } from "./preview";
import type { NormalizedReadableBatch, ReadableBatchSpec, ReadableImportPreview } from "./types";

export { commitFinanceArchiveImport } from "./commit";

export const ReadableImportRequestSchema = z.object({
  root: z.string().min(1),
  mode: z.enum(["preview", "commit"]).default("preview"),
  companyCode: z.string().regex(/^\d{2}$/).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
});

export interface PreparedFinanceArchiveImport {
  batch: NormalizedReadableBatch;
  preview: ReadableImportPreview;
}

const T6_LEDGER_TABLES = [
  "code", "GL_accvouch", "GL_accsum", "GL_accass", "GL_CashTable", "GL_mend",
  "Customer", "Vendor", "Person", "Department", "foreigncurrency", "dsign", "fitemss97", "fitemss98",
];
const T6_SYSTEM_TABLES = ["UA_Account", "UA_Account_sub", "UA_Period"];
const TPLUS_TABLES = [
  "AA_Account", "GL_Journal", "GL_Doc", "GL_AccountPeriodBegin", "GL_AccountPeriodBeginDetail",
  "GL_CashFlowInfo", "GL_WriteOffJournal", "AA_BankAccount", "AA_Partner", "AA_Department",
  "AA_Person", "AA_Project", "AA_ExpenseItem", "AA_Currency", "AA_CashFlowItem", "AA_AccountType",
  "AA_DocType", "AA_AccountAssociation",
];

function validatePreparedBatch(batch: NormalizedReadableBatch, preview: ReadableImportPreview) {
  if (!batch.accounts.length) throw new Error(`${batch.spec.sourceDatabase} has no accounts for ${batch.spec.year}`);
  if (preview.difference !== 0) {
    throw new Error(`${batch.spec.companyCode}-${batch.spec.year} debit/credit difference ${preview.difference}`);
  }
  for (const voucher of batch.vouchers) {
    if (!voucher.items.length) throw new Error(`Voucher ${voucher.voucherNo} has no items`);
    const difference = Math.round((voucher.totalDebit - voucher.totalCredit) * 100) / 100;
    if (difference !== 0) throw new Error(`Voucher ${voucher.voucherNo} is unbalanced by ${difference}`);
  }
}

export async function prepareFinanceArchiveImport(
  root: string,
  spec: ReadableBatchSpec,
): Promise<PreparedFinanceArchiveImport> {
  const requiredTables = spec.sourceSystem === "T6"
    ? [
        ...T6_LEDGER_TABLES.map((table) => ({ database: spec.sourceDatabase, table })),
        ...T6_SYSTEM_TABLES.map((table) => ({ database: "UFSystem", table })),
      ]
    : TPLUS_TABLES.map((table) => ({ database: spec.sourceDatabase, table }));
  const sourcePackage = await loadReadableArchiveEvidence({ root, spec, requiredTables });
  const batch = spec.sourceSystem === "T6"
    ? await loadT6Batch(root, spec, sourcePackage)
    : await loadTPlusBatch(root, spec, sourcePackage);
  const preview = previewReadableBatch(batch);
  validatePreparedBatch(batch, preview);
  return { batch, preview };
}
