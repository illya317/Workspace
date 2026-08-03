"use client";

import type { ReactNode } from "react";
import {
  workspaceBadgeClassName,
  workspaceLevelTagClassName,
  type BadgeTone,
} from "./workspace-colors";

export type { BadgeTone } from "./workspace-colors";

export interface BadgeProps {
  /** 显示文字。未传且提供了 level 时自动显示为 L{level}。 */
  label?: ReactNode;
  /** 颜色 tone。未传且提供了 level 时按层级使用对应的视觉 class。 */
  tone?: BadgeTone;
  /** 层级，用于组织树等场景；会按层级使用对应的视觉 class，未传 label 时默认显示为 L{level}。 */
  level?: number;
  className?: string;
}

export function badgeToneClassName(tone: BadgeTone, interactive = false) {
  return workspaceBadgeClassName(tone, interactive);
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
    ? badgeToneClassName(tone)
    : level
      ? workspaceLevelTagClassName(level)
      : badgeToneClassName("gray");
  const resolvedLabel = label ?? (level ? `L${level}` : "");
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${resolvedClass} ${className}`}>
      {resolvedLabel}
    </span>
  );
}
