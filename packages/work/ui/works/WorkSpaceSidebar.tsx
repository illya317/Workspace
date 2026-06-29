"use client";

import { createPageBody, createSelectorPanelSection, PageSurface } from "@workspace/core/ui";
import { getWorkSpaceLabel } from "./model";
import type { WorkTarget, WorkTaskSpace, WorkTargetType } from "./types";

export default function WorkSpaceSidebar({
  spaces,
  active,
  loading,
  onSelect,
}: {
  spaces: WorkTaskSpace[];
  active: WorkTarget | null;
  loading: boolean;
  onSelect: (space: WorkTaskSpace) => void;
}) {
  const groups: Array<{ type: WorkTargetType; title: string }> = [
    { type: "personal", title: "个人空间" },
    { type: "company", title: "公司空间" },
    { type: "department", title: "部门空间" },
    { type: "project", title: "项目空间" },
  ];

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createSelectorPanelSection<WorkTaskSpace>("work-spaces", {
          title: "工作空间",
          bodyClassName: "p-3",
          loading,
          loadingText: "加载中...",
          items: spaces,
          selectedId: active ? `${active.targetType}:${active.targetId}` : null,
          onSelect,
          getKey: (space) => `${space.targetType}:${space.targetId}`,
          groupBy: (space) => groups.find((group) => group.type === space.targetType)?.title ?? "",
          renderItem: (space) => ({
            title: space.name,
            subtitle: `${space.subtitle || getWorkSpaceLabel(space.targetType)} · 事项 ${space.counts.objective + space.counts.keyResult + space.counts.task}`,
            trailing: <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-xs text-slate-400">{roleLabel(space.role)}</span>,
          }),
          size: "sm",
          contentClassName: "space-y-4",
        }),
      ])}
    />
  );
}

function roleLabel(role: string) {
  if (role === "manager") return "管理";
  if (role === "delete") return "删除";
  if (role === "editor") return "编辑";
  return "查看";
}
