import type { VoucherCashFlowAllocation } from "@workspace/finance/types";

import { formatFinanceAmount } from "../formatters";

export function cashFlowAllocationsForItem(
  itemId: number,
  allocations: VoucherCashFlowAllocation[],
) {
  return allocations.filter((allocation) =>
    allocation.ownerVoucherItemId === itemId
    || (allocation.ownerVoucherItemId === null && allocation.counterpartItemId === itemId));
}

export function formatVoucherCashFlowDetail(allocations: VoucherCashFlowAllocation[]) {
  if (allocations.length === 0) return "-";
  return allocations.map((allocation) => {
    const direction = allocation.direction === "inflow"
      ? "流入"
      : allocation.direction === "outflow" ? "流出" : allocation.direction;
    return `${allocation.cashFlowItem.sourceName} · ${direction} ${formatFinanceAmount(allocation.amount)}`;
  }).join("；");
}
