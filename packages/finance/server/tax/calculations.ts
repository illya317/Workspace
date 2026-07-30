function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const TAX_CALCULATION_VERSION = "tax-v1";

export function calculateTaxAccrualLine(input: {
  taxBaseAmount?: number | null;
  taxRate?: number | null;
  quantity?: number | null;
  unitRate?: number | null;
  divisor?: number | null;
  sourceReportedTaxAmount?: number | null;
}) {
  const hasBaseRate = input.taxBaseAmount != null || input.taxRate != null;
  const hasQuantityRate = input.quantity != null || input.unitRate != null || input.divisor != null;
  if (hasBaseRate === hasQuantityRate) {
    throw new Error("计税明细必须且只能使用 base×rate 或 quantity×unitRate÷divisor 一种方法");
  }
  let method: "base_rate" | "quantity_unit_rate";
  let calculatedAmount: number;
  if (hasBaseRate) {
    if (input.taxBaseAmount == null || input.taxRate == null) throw new Error("base×rate 方法缺少计税基础或税率");
    method = "base_rate";
    calculatedAmount = roundMoney(input.taxBaseAmount * input.taxRate);
  } else {
    if (input.quantity == null || input.unitRate == null || input.divisor == null || input.divisor <= 0) {
      throw new Error("quantity×unitRate÷divisor 方法缺少数量、单位税额或有效除数");
    }
    method = "quantity_unit_rate";
    calculatedAmount = roundMoney(input.quantity * input.unitRate / input.divisor);
  }
  const sourceReportedAmount = input.sourceReportedTaxAmount ?? null;
  return {
    method,
    calculatedAmount,
    sourceReportedAmount,
    sourceDifference: sourceReportedAmount === null ? null : roundMoney(calculatedAmount - sourceReportedAmount),
  };
}

export function calculateTaxWorkpaper(lines: Parameters<typeof calculateTaxAccrualLine>[0][]) {
  const calculatedLines = lines.map(calculateTaxAccrualLine);
  const calculatedAmount = roundMoney(calculatedLines.reduce((sum, line) => sum + line.calculatedAmount, 0));
  const sourceReportedAmount = calculatedLines.every((line) => line.sourceReportedAmount === null)
    ? null
    : roundMoney(calculatedLines.reduce((sum, line) => sum + (line.sourceReportedAmount ?? 0), 0));
  return {
    lines: calculatedLines,
    calculatedAmount,
    sourceReportedAmount,
    sourceDifference: sourceReportedAmount === null ? null : roundMoney(calculatedAmount - sourceReportedAmount),
  };
}

export function calculateTaxPaymentAllocation(amount: number, allocations: Array<{ allocatedAmount: number }>) {
  const allocatedAmount = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0));
  return { allocatedAmount, unallocatedAmount: roundMoney(amount - allocatedAmount) };
}

type TaxPaymentAsOfInput = {
  id: number;
  paymentKind: string;
  paidOn: string | Date;
  reversesPaymentId: number | null;
  allocations: Array<{ filingId: number; allocatedAmount: number | { toNumber(): number } }>;
};

function dateOnly(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

/** Replays append-only payment/refund/reversal facts as they stood at the requested period end. */
export function calculateTaxPaidByFilingAsOf(payments: TaxPaymentAsOfInput[], asOfDate: string) {
  const effective = payments.filter((payment) => dateOnly(payment.paidOn) <= asOfDate);
  const reversedPaymentIds = new Set(effective.flatMap((payment) => (
    payment.paymentKind === "reversal" && payment.reversesPaymentId != null ? [payment.reversesPaymentId] : []
  )));
  const paidByFiling = new Map<number, number>();
  const effectivePaymentIds = new Set<number>();
  for (const payment of effective) {
    if (payment.paymentKind === "reversal" || reversedPaymentIds.has(payment.id)) continue;
    const sign = payment.paymentKind === "refund" ? -1 : payment.paymentKind === "payment" ? 1 : 0;
    if (sign === 0) continue;
    effectivePaymentIds.add(payment.id);
    for (const allocation of payment.allocations) {
      const amount = typeof allocation.allocatedAmount === "number"
        ? allocation.allocatedAmount
        : allocation.allocatedAmount.toNumber();
      paidByFiling.set(
        allocation.filingId,
        roundMoney((paidByFiling.get(allocation.filingId) ?? 0) + sign * amount),
      );
    }
  }
  return { paidByFiling, effectivePaymentIds, reversedPaymentIds };
}
