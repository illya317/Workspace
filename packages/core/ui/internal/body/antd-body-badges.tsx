"use client";

import { Tag } from "antd";
import type { BodySurfaceBadgeSpec } from "../../BodySurface.types";
import { workspaceSemanticTagClassName } from "../common/workspace-colors";

/** 章节 header 徽章的 antd 渲染(section header 与 drilldown 目录共用)。 */
export function AntdSectionBadges({ badges }: { badges?: BodySurfaceBadgeSpec[] }) {
  if (!badges?.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {badges.map((badge) => (
        <Tag key={badge.key} className={`!m-0 ${workspaceSemanticTagClassName(badge.tone ?? "default")}`}>{badge.label}</Tag>
      ))}
    </span>
  );
}
