import { z } from "zod";
import { loadT6Batch } from "./t6-adapter";
import { loadTPlusBatch } from "./tplus-adapter";
import { previewReadableBatch } from "./preview";
import type { NormalizedReadableBatch, ReadableBatchSpec, ReadableImportPreview } from "./types";

export { commitFinanceArchiveImport } from "./commit";
export { selectReadableBatches } from "./source-plan";

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
  const batch = spec.sourceSystem === "T6"
    ? await loadT6Batch(root, spec)
    : await loadTPlusBatch(root, spec);
  const preview = previewReadableBatch(batch);
  validatePreparedBatch(batch, preview);
  return { batch, preview };
}
