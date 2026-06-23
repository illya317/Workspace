export interface StatusBadgeProps {
  /** 显示文字 */
  label: string;
  /** 颜色变体，不内置任何业务状态映射 */
  variant: "gray" | "green" | "blue" | "red" | "yellow" | "orange";
  className?: string;
}

const VARIANT_CLASS: Record<StatusBadgeProps["variant"], string> = {
  gray: "bg-gray-100 text-gray-600",
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-sky-50 text-sky-600",
  red: "bg-red-50 text-red-700",
  yellow: "bg-yellow-50 text-yellow-700",
  orange: "bg-orange-50 text-orange-600",
};

/**
 * 通用状态徽标。
 * 不内置业务状态——pending/approved/rejected 等映射放在业务层。
 *
 * 示例：
 *   <StatusBadge label="待审核" variant="gray" />
 *   <StatusBadge label="已通过" variant="green" />
 */
export default function StatusBadge({ label, variant, className }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${VARIANT_CLASS[variant]} ${className ?? ""}`}
    >
      {label}
    </span>
  );
}
