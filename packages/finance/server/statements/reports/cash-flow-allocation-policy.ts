export interface CashSideItem {
  debit: number;
  credit: number;
  account: { code: string };
}

export interface CashFlowPresentationAdjustment {
  sourceLineCode: string;
  targetLineCode: string;
  amount: number;
  enabled: boolean;
}

const CASH_ACCOUNT_PREFIXES = ["1001", "1002", "1012"];

function isCashAccount(code: string) {
  return CASH_ACCOUNT_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function normalizeCashFlowAllocationAmount(input: {
  amount: number;
  lineDirection: "in" | "out" | "net";
  ownerVoucherItem: CashSideItem | null;
  counterpartItem: CashSideItem | null;
}) {
  const cashItems = [input.ownerVoucherItem, input.counterpartItem]
    .filter((item): item is CashSideItem => item !== null && isCashAccount(item.account.code));
  const cashNet = cashItems.reduce((sum, item) => sum + item.debit - item.credit, 0);
  const actualDirection = cashNet > 0 ? "in" : cashNet < 0 ? "out" : null;
  const directionSign = actualDirection && input.lineDirection !== "net" && actualDirection !== input.lineDirection
    ? -1
    : 1;
  return Math.abs(input.amount) * directionSign;
}

export function applyCashFlowPresentationAdjustment(input: {
  sourceLineCode: string;
  normalizedAmount: number;
  adjustment: CashFlowPresentationAdjustment | null;
}) {
  const adjustment = input.adjustment;
  if (!adjustment?.enabled) {
    return { sourceAmount: input.normalizedAmount, targetLineCode: null, targetAmount: 0, diagnostic: null };
  }
  if (adjustment.sourceLineCode !== input.sourceLineCode) {
    return {
      sourceAmount: input.normalizedAmount,
      targetLineCode: null,
      targetAmount: 0,
      diagnostic: `现金流列示调整来源行 ${adjustment.sourceLineCode} 与当前映射 ${input.sourceLineCode} 不一致，已跳过`,
    };
  }
  const amount = Math.abs(adjustment.amount);
  if (amount > Math.abs(input.normalizedAmount)) {
    return {
      sourceAmount: input.normalizedAmount,
      targetLineCode: null,
      targetAmount: 0,
      diagnostic: `现金流列示调整金额 ${amount.toFixed(2)} 超过来源分配 ${Math.abs(input.normalizedAmount).toFixed(2)}，已跳过`,
    };
  }
  const sign = input.normalizedAmount < 0 ? -1 : 1;
  return {
    sourceAmount: input.normalizedAmount - amount * sign,
    targetLineCode: adjustment.targetLineCode,
    targetAmount: amount * sign,
    diagnostic: null,
  };
}
