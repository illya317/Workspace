import { moneyIsNonZero } from "./money-cents";

export function uniqueLinkedAssetVoucherNo(
  entries: Array<{ normalAmount: unknown; voucher?: { voucherNo: string } | null }>,
  adjustments: Array<{ amount: unknown; voucher?: { voucherNo: string } | null }>,
) {
  const linked = new Set([
    ...entries.filter((row) => moneyIsNonZero(row.normalAmount)).flatMap((row) => row.voucher?.voucherNo ?? []),
    ...adjustments.filter((row) => moneyIsNonZero(row.amount)).flatMap((row) => row.voucher?.voucherNo ?? []),
  ]);
  return linked.size === 1 ? [...linked][0]! : null;
}
