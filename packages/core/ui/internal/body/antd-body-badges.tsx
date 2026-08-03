"use client";

import { Tag } from "antd";
import type { BodySurfaceBadgeSpec } from "../../BodySurface.types";

const BADGE_TAG_COLOR: Record<NonNullable<BodySurfaceBadgeSpec["tone"]>, string | undefined> = {
  default: undefined,
  muted: undefined,
  info: "blue",
  success: "green",
  warning: "gold",
  danger: "red",
};

/** 章节 header 徽章的 antd 渲染(section header 与 drilldown 目录共用)。 */
export function AntdSectionBadges({ badges }: { badges?: BodySurfaceBadgeSpec[] }) {
  if (!badges?.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {badges.map((badge) => (
        <Tag key={badge.key} className="m-0" color={BADGE_TAG_COLOR[badge.tone ?? "default"]}>{badge.label}</Tag>
      ))}
    </span>
  );
}
