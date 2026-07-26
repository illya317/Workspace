import { oppositeBalanceSide } from "./resolution";

type NumericValue = number | string | { toString(): string };

/**
 * 按往来户逐户毛额口径求异常方向金额：
 * 每一行是一个往来户已净额后的期末余额，处于自然方向反向的户按 |net| 累加。
 * 全部为正常方向或为零时返回 0。
 */
export function counterpartyGrossAbnormalAmount(
  rows: readonly { closingDebit: NumericValue; closingCredit: NumericValue }[],
  balanceDirection: string,
): number {
  let total = 0;
  for (const row of rows) {
    const net = roundMoney(Number(row.closingDebit) - Number(row.closingCredit));
    const side = net > 0 ? "debit" : net < 0 ? "credit" : null;
    if (!side || side !== oppositeBalanceSide(balanceDirection)) continue;
    total = roundMoney(total + Math.abs(net));
  }
  return total;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
