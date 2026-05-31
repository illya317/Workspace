import type { StatusBadgeProps } from "@/app/components/StatusBadge";

/**
 * 重分类状态到全局 StatusBadge variant 的映射。
 * 业务常量，不进全局组件。
 *
 * 使用：
 *   const s = RECLASS_STATUS[row.status];
 *   <StatusBadge label={s.label} variant={s.variant} />
 */
export const RECLASS_STATUS: Record<
  string,
  { label: string; variant: StatusBadgeProps["variant"] }
> = {
  pending: { label: "待审核", variant: "gray" },
  approved: { label: "已通过", variant: "green" },
  adjusted: { label: "已调整", variant: "blue" },
  rejected: { label: "已驳回", variant: "red" },
};
