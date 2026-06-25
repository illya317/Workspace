"use client";

import type { ReactNode } from "react";

export type BadgeTone =
  | "gray"
  | "green"
  | "blue"
  | "red"
  | "yellow"
  | "orange"
  | "emerald"
  | "sky"
  | "slate"
  | "amber";

export interface BadgeProps {
  /** 显示文字。未传且提供了 level 时自动显示为 L{level}。 */
  label?: ReactNode;
  /** 颜色 tone。未传且提供了 level 时按层级使用对应的视觉 class。 */
  tone?: BadgeTone;
  /** 层级，用于组织树等场景；会按层级使用对应的视觉 class，未传 label 时默认显示为 L{level}。 */
  level?: number;
  className?: string;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  gray: "bg-gray-100 text-gray-600",
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-sky-50 text-sky-600",
  red: "bg-red-50 text-red-700",
  yellow: "bg-yellow-50 text-yellow-700",
  orange: "bg-orange-50 text-orange-600",
  emerald: "bg-emerald-100 text-emerald-700",
  sky: "bg-sky-100 text-sky-700",
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-700",
};

function classFromLevel(level: number): string {
  if (level === 1) return "bg-blue-100 text-blue-700";
  if (level === 2) return "bg-emerald-100 text-emerald-700";
  if (level === 3) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

/**
 * 通用徽标 primitive。
 * 同时覆盖原 StatusBadge（状态徽标）和 HierarchyBadge（层级徽标）场景。
 *
 * 示例：
 *   <Badge label="待审核" tone="gray" />
 *   <Badge label="已通过" tone="green" />
 *   <Badge level={2} className="shrink-0 px-2 py-0.5 font-semibold" />
 */
export default function Badge({ label, tone, level, className = "" }: BadgeProps) {
  const resolvedClass = tone
    ? TONE_CLASS[tone]
    : level
      ? classFromLevel(level)
      : TONE_CLASS.gray;
  const resolvedLabel = label ?? (level ? `L${level}` : "");
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${resolvedClass} ${className}`}>
      {resolvedLabel}
    </span>
  );
}
