import { createMetricsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { WorkTarget, WorkTaskSpace } from "./types";

export function roleAllows(role: string | null | undefined, required: "viewer" | "editor" | "manager") {
  const levels = { viewer: 0, editor: 1, delete: 2, manager: 3 };
  return role ? levels[role as keyof typeof levels] >= levels[required] : false;
}

export function sameTarget(a: WorkTarget | null | undefined, b: WorkTarget | null | undefined) {
  return Boolean(a && b && a.targetType === b.targetType && a.targetId === b.targetId);
}

export function createSpaceMetricsSection(space: WorkTaskSpace): BodySurfaceSectionSpec {
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
