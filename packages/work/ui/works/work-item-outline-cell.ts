"use client";

import type { DataSurfaceCellSpec } from "@workspace/core/ui";
import { getRoutineTaskTypeLabel } from "./model";
import type { WorkItem } from "./types";

export const WORK_ITEM_OUTLINE_COLUMN_WIDTH = "18rem";

type WorkItemOutlineCellItem = Pick<
  WorkItem,
  | "id"
  | "targetType"
  | "targetId"
  | "itemType"
  | "routineTaskType"
  | "content"
  | "krTargetValue"
  | "krUnit"
  | "parentWorkItemContent"
  | "parentPeriodWorkItemContent"
  | "parentPeriodWorkItemTargetType"
  | "parentPeriodWorkItemTargetId"
  | "parentPeriodWorkItemKrTargetValue"
  | "parentPeriodWorkItemKrCurrentValue"
  | "parentPeriodWorkItemKrUnit"
  | "previousPeriodWorkItemContent"
> & {
  depth?: number;
  childCount?: number;
};

export type WorkItemOutlineCellOptions = {
  depth?: number;
  collapsible?: boolean;
  expanded?: boolean;
  showParent?: boolean;
  showAllocation?: boolean;
  showRelations?: boolean;
  showTypeBadge?: boolean;
  note?: string | null;
  onToggle?: () => void;
};

/** @ui-structural-declaration Complete work-outline hierarchy, relations, status, and disclosure cell. */
export function createWorkItemOutlineCell(work: WorkItemOutlineCellItem, options: WorkItemOutlineCellOptions = {}): DataSurfaceCellSpec {
  const meta = workOutlineMetaSpec(work, options);
  return {
    kind: "group",
    direction: "column",
    items: meta ? [workTitleLineSpec(work, options), meta] : [workTitleLineSpec(work, options)],
  };
}

function workTitleLineSpec(work: WorkItemOutlineCellItem, options: WorkItemOutlineCellOptions): DataSurfaceCellSpec {
  const expanded = Boolean(options.expanded);
  const depth = options.depth ?? work.depth ?? 0;
  const toggleAction: DataSurfaceCellSpec[] = options.collapsible && options.onToggle ? [{
    kind: "action",
    action: {
      key: `toggle-${work.id}`,
      label: expanded ? "收起" : "展开",
      icon: expanded ? "tree-collapse" : "tree-expand",
      size: "sm",
      presentation: "glyph",
      onClick: options.onToggle,
    },
  }] : [];
  return {
    kind: "group",
    items: [
      ...toggleAction,
      ...(options.showTypeBadge === false ? [] : [workTypeBadgeSpec(work)]),
      { kind: "text", value: `${depthPrefix(depth)}${work.content}`, emphasis: "medium", wrap: "wrap" },
    ],
  };
}

function workOutlineMetaSpec(work: WorkItemOutlineCellItem, options: WorkItemOutlineCellOptions): DataSurfaceCellSpec | null {
  const parentItem: Array<Extract<DataSurfaceCellSpec, { kind: "text" }>> = options.showParent && work.parentWorkItemContent
    ? [{ kind: "text", value: `所属：${work.parentWorkItemContent}`, tone: "muted", wrap: "wrap" }]
    : [];
  const allocationItem: Array<Extract<DataSurfaceCellSpec, { kind: "text" }>> = options.showAllocation && work.itemType === "key_result" && work.parentPeriodWorkItemKrTargetValue !== null
    ? [{ kind: "text", value: allocationSummary(work), tone: "muted", wrap: "wrap" }]
    : [];
  const relationText = options.showRelations ? [
    work.parentPeriodWorkItemContent ? `${parentPeriodRelationLabel(work)}：${work.parentPeriodWorkItemContent}` : null,
    work.previousPeriodWorkItemContent ? `前置：${work.previousPeriodWorkItemContent}` : null,
  ].filter(Boolean).join(" · ") : "";
  const relationItem: Array<Extract<DataSurfaceCellSpec, { kind: "text" }>> = relationText
    ? [{ kind: "text", value: relationText, tone: "muted", wrap: "wrap" }]
    : [];
  const noteItem: Array<Extract<DataSurfaceCellSpec, { kind: "text" }>> = options.note
    ? [{ kind: "text", value: options.note, tone: "muted", wrap: "wrap" }]
    : [];
  const items = [...parentItem, ...allocationItem, ...relationItem, ...noteItem];
  return items.length ? { kind: "stack", gap: "xs", items } : null;
}

function workTypeBadgeSpec(work: Pick<WorkItemOutlineCellItem, "itemType" | "routineTaskType">): DataSurfaceCellSpec {
  return {
    kind: "badge",
    label: workTypeBadgeLabel(work),
    tone: work.itemType === "objective" ? "green" : work.itemType === "key_result" ? "blue" : "slate",
  };
}

function workTypeBadgeLabel(work: Pick<WorkItemOutlineCellItem, "itemType" | "routineTaskType">) {
  if (work.itemType === "objective") return "目标";
  if (work.itemType === "key_result") return "KR";
  return work.routineTaskType ? getRoutineTaskTypeLabel(work.routineTaskType) : "执行任务";
}

function parentPeriodRelationLabel(work: Pick<WorkItemOutlineCellItem, "itemType" | "targetType" | "targetId" | "parentPeriodWorkItemTargetType" | "parentPeriodWorkItemTargetId">) {
  if (work.parentPeriodWorkItemTargetType && (work.parentPeriodWorkItemTargetType !== work.targetType || work.parentPeriodWorkItemTargetId !== work.targetId)) return "对齐到";
  if (work.itemType === "objective") return "上级目标";
  if (work.itemType === "key_result") return "上级 KR";
  return "对齐到";
}

function allocationSummary(work: WorkItemOutlineCellItem) {
  const ownUnit = work.krUnit || work.parentPeriodWorkItemKrUnit || "";
  const parentUnit = work.parentPeriodWorkItemKrUnit || ownUnit;
  const allocation = work.krTargetValue === null ? "未填" : `${work.krTargetValue}${ownUnit}`;
  const parentTarget = work.parentPeriodWorkItemKrTargetValue === null ? "未填" : `${work.parentPeriodWorkItemKrTargetValue}${parentUnit}`;
  return `分配：${allocation} / 上级指标：${parentTarget}`;
}

function depthPrefix(depth: number) {
  if (depth <= 0) return "";
  return "　".repeat(Math.min(depth, 4));
}
