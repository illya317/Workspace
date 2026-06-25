import Badge from "./Badge";

export interface StatusBadgeProps {
  /** 显示文字 */
  label: string;
  /** 颜色变体，不内置任何业务状态映射 */
  variant: "gray" | "green" | "blue" | "red" | "yellow" | "orange";
  className?: string;
}

/**
 * @deprecated 请直接使用 Badge。
 */
export default function StatusBadge({ label, variant, className }: StatusBadgeProps) {
  return <Badge label={label} tone={variant} className={className} />;
}
