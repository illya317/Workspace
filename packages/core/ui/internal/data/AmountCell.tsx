import NumberCell from "./NumberCell";

export interface AmountCellProps {
  /** 金额数值 */
  value: number | null | undefined;
  /** 货币符号，默认 ¥ */
  currencySymbol?: string;
  /** null/undefined 时是否显示 0.00，默认不显示 */
  showZero?: boolean;
  /** 负数时额外 className，如 text-red-600 */
  negativeClassName?: string;
  /** 传给 NumberCell 的 locale */
  locale?: string;
  /** 传给 NumberCell 的小数位数 */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  className?: string;
}

/**
 * 金额显示单元格。
 * 基于 NumberCell，叠加金额语义：货币符号、负数颜色、showZero。
 * 不硬编码 locale——财务总账可传 locale="en-US"。
 */
export default function AmountCell({
  value,
  currencySymbol = "¥",
  showZero = false,
  negativeClassName = "text-red-600",
  locale,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
  className,
}: AmountCellProps) {
  // null/undefined + showZero → 显示 0
  const displayValue = value == null && showZero ? 0 : value;

  // null/undefined + !showZero → 显示空
  if (displayValue == null) {
    return <span className="text-right tabular-nums text-gray-300">—</span>;
  }

  const isNegative = displayValue < 0;

  return (
    <span className={`whitespace-nowrap ${isNegative ? negativeClassName : ""} ${className ?? ""}`}>
      <span className="text-gray-400">{currencySymbol}</span>
      <NumberCell
        value={Math.abs(displayValue)}
        locale={locale}
        minimumFractionDigits={minimumFractionDigits}
        maximumFractionDigits={maximumFractionDigits}
      />
    </span>
  );
}
