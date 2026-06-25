"use client";

import { EmptyStateCard, PanelCard, SelectorCard } from "@workspace/core/ui";
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
    <PanelCard bodyClassName="p-3">
      <div className="mb-3 px-1 text-xs font-semibold text-slate-400">工作空间</div>
      {loading ? (
        <EmptyStateCard compact>加载中...</EmptyStateCard>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const items = spaces.filter((space) => space.targetType === group.type);
            if (items.length === 0) return null;
            return (
              <div key={group.type}>
                <div className="mb-1 px-1 text-xs font-semibold text-slate-500">{group.title}</div>
                <div className="space-y-1">
                  {items.map((space) => {
                    const selected = active?.targetType === space.targetType && active.targetId === space.targetId;
                    return (
                      <SelectorCard
                        key={`${space.targetType}:${space.targetId}`}
                        title={space.name}
                        subtitle={space.subtitle || getWorkSpaceLabel(space.targetType)}
                        meta={[`${space.counts.objective + space.counts.keyResult + space.counts.task}`]}
                        trailing={<span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-xs text-slate-400">{roleLabel(space.role)}</span>}
                        active={selected}
                        onClick={() => onSelect(space)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}

function roleLabel(role: string) {
  if (role === "manager") return "管理";
  if (role === "delete") return "删除";
  if (role === "editor") return "编辑";
  return "查看";
}
