import { roundMoney } from "./read-jsonl";
import type { NormalizedReadableBatch, ReadableImportPreview } from "./types";

export function previewReadableBatch(batch: NormalizedReadableBatch): ReadableImportPreview {
  const items = batch.vouchers.flatMap((voucher) => voucher.items);
  const debit = roundMoney(items.reduce((sum, item) => sum + item.debit, 0));
  const credit = roundMoney(items.reduce((sum, item) => sum + item.credit, 0));
  const difference = roundMoney(debit - credit);
  const warnings = [...batch.warnings];
  if (difference !== 0) warnings.push(`凭证明细借贷不平：${difference.toFixed(2)}`);
  return {
    spec: batch.spec,
    accountCount: batch.accounts.length,
    voucherCount: batch.vouchers.length,
    postedVoucherCount: batch.vouchers.filter((item) => item.status === "posted").length,
    draftVoucherCount: batch.vouchers.filter((item) => item.status === "draft").length,
    itemCount: items.length,
    debit,
    credit,
    difference,
    sourceBalanceCount: batch.sourceBalances.length,
    auxiliaryMemberCount: batch.auxiliaryMembers.length,
    auxiliaryBalanceCount: batch.auxiliaryBalances.length,
    cashFlowAllocationCount: batch.cashFlowAllocations.length,
    openItemCount: batch.openItems.length,
    warnings,
  };
}
