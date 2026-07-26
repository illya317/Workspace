import NumberCell from "./NumberCell";

export interface AmountCellProps {
  /** 金额数值 */
  value: number | null | undefined;
  /** 货币符号，默认 ¥ */
  currencySymbol?: string;
  /** null/undefined 时是否按金额零值显示，默认不显示 */
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

export function amountCurrencyPrefix(value: number, currencySymbol: string) {
  return `${value < 0 ? "-" : ""}${currencySymbol}`;
}

export function amountNumberPresentation(
  value: number,
  currencySymbol: string,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
) {
  const scale = 10 ** maximumFractionDigits;
  const displayedAsZero = Math.round(Math.abs(value) * scale) === 0;
  return {
    currencyPrefix: displayedAsZero ? "" : amountCurrencyPrefix(value, currencySymbol),
    minimumFractionDigits: displayedAsZero ? 0 : minimumFractionDigits,
    maximumFractionDigits: displayedAsZero ? 0 : maximumFractionDigits,
  };
}

/**
 * 金额显示单元格。
 * 基于 NumberCell，叠加金额语义：货币符号、负号、负数颜色、showZero。
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
  const presentation = amountNumberPresentation(
    displayValue,
    currencySymbol,
    minimumFractionDigits,
    maximumFractionDigits,
  );

  return (
    <span className={`whitespace-nowrap text-right tabular-nums ${isNegative ? negativeClassName : ""} ${className ?? ""}`}>
      <span className="text-gray-400">{presentation.currencyPrefix}</span>
      <NumberCell
        value={Math.abs(displayValue)}
        locale={locale}
        minimumFractionDigits={presentation.minimumFractionDigits}
        maximumFractionDigits={presentation.maximumFractionDigits}
      />
    </span>
  );
}
