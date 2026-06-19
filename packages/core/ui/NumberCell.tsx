export interface NumberCellProps {
  /** 数值，null/undefined 显示 empty 文本 */
  value: number | null | undefined;
  /** 国际化 locale，默认 zh-CN */
  locale?: string;
  /** 最小小数位数 */
  minimumFractionDigits?: number;
  /** 最大小数位数 */
  maximumFractionDigits?: number;
  /** 空值占位文本，默认 "—" */
  empty?: string;
  className?: string;
}

/**
 * 通用数字显示单元格。
 * 默认右对齐。不带货币符号——金额语义用 AmountCell。
 */
export default function NumberCell({
  value,
  locale = "zh-CN",
  minimumFractionDigits,
  maximumFractionDigits,
  empty = "—",
  className,
}: NumberCellProps) {
  if (value == null) {
    return <span className={`text-gray-300 ${className ?? ""}`}>{empty}</span>;
  }

  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return <span className={`text-right tabular-nums ${className ?? ""}`}>{formatted}</span>;
}
