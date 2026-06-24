"use client";

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
    <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 px-1 text-xs font-semibold text-slate-400">工作空间</div>
      {loading ? (
        <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">加载中...</div>
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
                      <button
                        key={`${space.targetType}:${space.targetId}`}
                        type="button"
                        onClick={() => onSelect(space)}
                        className={`w-full rounded-md px-3 py-2 text-left transition ${
                          selected
                            ? "bg-emerald-50 text-emerald-800"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{space.name}</span>
                          <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-xs text-slate-400">{roleLabel(space.role)}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs text-slate-400">
                          <span className="truncate">{space.subtitle || getWorkSpaceLabel(space.targetType)}</span>
                          <span>{space.counts.objective + space.counts.keyResult + space.counts.task}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function roleLabel(role: string) {
  if (role === "manager") return "管理";
  if (role === "delete") return "删除";
  if (role === "editor") return "编辑";
  return "查看";
}
