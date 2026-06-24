"use client";

import { useState, type FC } from "react";
import {
  HierarchyBadge,
  StatusBadge,
  StatusToggle,
} from "@workspace/core/ui";

function HierarchyBadgePreview() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <HierarchyBadge level={1} />
      <HierarchyBadge level={2} />
      <HierarchyBadge level={3} />
      <HierarchyBadge level={4} />
      <HierarchyBadge label="自定义" tone="emerald" />
    </div>
  );
}

function StatusBadgePreview() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge label="已启用" variant="green" />
      <StatusBadge label="待审核" variant="yellow" />
      <StatusBadge label="已归档" variant="gray" />
    </div>
  );
}

function StatusTogglePreview() {
  return (
    <StatusToggle
      active="active"
      tabs={[{ key: "active", label: "现用", count: 12 }, { key: "all", label: "全部", count: 18 }]}
      onChange={() => {}}
    />
  );
}

function hierarchyBadgeClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">hierarchyBadgeClassName</p><p>层级徽标样式 recipe，统一组织树节点层级标识 class。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

export const statusPreviewByName: Record<string, FC> = {
  HierarchyBadge: HierarchyBadgePreview,
  StatusBadge: StatusBadgePreview,
  StatusToggle: StatusTogglePreview,
  hierarchyBadgeClassName: hierarchyBadgeClassNamePreview,
};
