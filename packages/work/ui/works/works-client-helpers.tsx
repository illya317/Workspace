import { createMetricsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import { getWorkSpaceLabel } from "./model";
import type { WorkTarget, WorkTaskSpace } from "./types";

export function spaceSelectorBlock(
  spaces: WorkTaskSpace[],
  active: WorkTarget | null,
  loading: boolean,
  onSelect: (space: WorkTaskSpace) => void,
): BodySurfaceSectionSpec {
  const groups: Array<{ type: WorkTaskSpace["targetType"]; title: string }> = [
    { type: "personal", title: "个人空间" },
    { type: "company", title: "公司空间" },
    { type: "department", title: "部门空间" },
    { type: "project", title: "项目空间" },
  ];

  return {
    key: "work-space-selector",
    body: {
      kind: "navigation",
      navigation: {
        kind: "selector" as const,
        selector: {
          mode: "list" as const,
          title: "工作空间",

          loading,
          loadingText: "加载中...",
          items: spaces,
          selectedId: active ? `${active.targetType}:${active.targetId}` : null,
          onSelect,
          getKey: (space: WorkTaskSpace) => `${space.targetType}:${space.targetId}`,
          groupBy: (space: WorkTaskSpace) => groups.find((group) => group.type === space.targetType)?.title ?? "",
          renderItem: (space: WorkTaskSpace) => ({
            title: space.name,
            subtitle: `${space.subtitle || getWorkSpaceLabel(space.targetType)} · 事项 ${space.counts.objective + space.counts.keyResult + space.counts.task}`,
            trailing: <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-xs text-slate-400">{roleLabel(space.role)}</span>,
          }),
          size: "sm",

        },
      },
    },
  };
}

export function roleAllows(role: string | null | undefined, required: "viewer" | "editor" | "manager") {
  const levels = { viewer: 0, editor: 1, delete: 2, manager: 3 };
  return role ? levels[role as keyof typeof levels] >= levels[required] : false;
}

export function sameTarget(a: WorkTarget | null | undefined, b: WorkTarget | null | undefined) {
  return Boolean(a && b && a.targetType === b.targetType && a.targetId === b.targetId);
}

export function spaceMetricsBlock(space: WorkTaskSpace): BodySurfaceSectionSpec {
  return createMetricsSection("space-metrics", {
    metrics: [
      { key: "objective", label: "目标", value: space.counts.objective,  },
      { key: "keyResult", label: "关键结果", value: space.counts.keyResult,  },
      { key: "task", label: "子任务", value: space.counts.task,  },
      { key: "archived", label: "归档", value: space.counts.archived,  },
    ],

  });
}

export function normalizeInitialTarget(target?: WorkTarget) {
  if (!target || !Number.isFinite(target.targetId) || target.targetId <= 0) return null;
  return target;
}

export function nextSortOrder(items: Array<{ sortOrder: number }>) {
  if (items.length === 0) return 10;
  return Math.max(...items.map((item) => item.sortOrder || 0)) + 10;
}

function roleLabel(role: string) {
  if (role === "manager") return "管理";
  if (role === "editor") return "编辑";
  if (role === "delete") return "删除";
  return "查看";
}
