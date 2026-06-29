"use client";

import { createPageBody, createMetricsSection, type DataSurfaceCommandSpec, PageSurface } from "@workspace/core/ui";
import type { WorkItem } from "./types";
export default function WorkCard({
  work,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
  onArchive,
  onRestore,
  isFirst,
  isLast
}: {
  work: WorkItem;
  isAdmin: boolean;
  onEdit: (w: WorkItem) => void;
  onDelete: (id: number) => void;
  onMove: (id: number, direction: number) => void;
  onArchive?: (id: number) => void;
  onRestore?: (id: number) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const actions: DataSurfaceCommandSpec[] | undefined = isAdmin ? [
    ...(!work.isArchived ? [
      { key: "up", label: "上移", onClick: () => onMove(work.id, -1), disabled: isFirst },
      { key: "down", label: "下移", onClick: () => onMove(work.id, 1), disabled: isLast },
      { key: "edit", label: "编辑", onClick: () => onEdit(work) },
      { key: "archive", label: "归档", onClick: () => onArchive?.(work.id) },
    ] satisfies DataSurfaceCommandSpec[] : [
      { key: "restore", label: "恢复", onClick: () => onRestore?.(work.id) },
    ] satisfies DataSurfaceCommandSpec[]),
    { key: "delete", label: "删除", variant: "danger", onClick: () => onDelete(work.id) },
  ] : undefined;

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createMetricsSection("work-card", {
      metrics: [
        { key: "importance", label: "重要度", value: work.importance },
        { key: "urgency", label: "紧急度", value: work.urgency },
        { key: "participants", label: "参与人", value: work.participants.length > 0 ? work.participants.map(p => p.name).join("、") : "无" },
        { key: "created", label: "创建于", value: new Date(work.createdAt).toLocaleDateString("zh-CN") },
      ],
      actions,
    })])}
    />
  );
}
