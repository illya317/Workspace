"use client";

import type { ReactNode } from "react";
import { PanelCard, StatusBadge } from "@workspace/core/ui";
import { getStatusLabel, getWorkItemTypeLabel, getWorkPeriodLabel, getWorkSourceTypeLabel } from "./model";
import type { WorkItem } from "./types";

export function WorkTaskDetail({ work }: { work: WorkItem }) {
  const status = work.itemType === "task" ? (work.isArchived ? "archived" : work.status) : null;
  return (
    <PanelCard className="shadow-none" bodyClassName="p-4">
      <div className="grid gap-4 text-sm lg:grid-cols-2">
        <DetailItem label="节点内容" className="lg:col-span-2">
        <p className="whitespace-pre-wrap text-slate-900">{work.content}</p>
      </DetailItem>
      {work.description && (
        <DetailItem label="描述" className="lg:col-span-2">
          <p className="whitespace-pre-wrap text-slate-700">{work.description}</p>
        </DetailItem>
      )}
      <DetailItem label="节点类型">{getWorkItemTypeLabel(work.itemType)}</DetailItem>
      <DetailItem label="来源">{getWorkSourceTypeLabel(work.sourceType)}</DetailItem>
      {work.targetType !== "personal" && <DetailItem label="负责人">{work.ownerEmployeeName || "未设置"}</DetailItem>}
      {status && <DetailItem label="状态"><StatusBadge label={getStatusLabel(status)} variant={statusVariant(status)} /></DetailItem>}
      <DetailItem label="计划周期">{getWorkPeriodLabel(work)}</DetailItem>
      {work.itemType === "task" && <DetailItem label="起止时间">{dateRange(work.startDate, work.dueDate)}</DetailItem>}
      {work.itemType === "key_result" && <DetailItem label="结果">{krRange(work)}</DetailItem>}
      <DetailItem label="上级节点">{work.parentWorkItemContent || "根节点"}</DetailItem>
      {work.sourceType === "project" && <DetailItem label="关联项目">{work.linkedProjectName || "未关联"}</DetailItem>}
      {work.sourceType === "project" && <DetailItem label="关联项目阶段">{work.linkedProjectPhaseName || "未关联"}</DetailItem>}
      {work.sourceType === "project" && <DetailItem label="关联项目任务">{work.linkedProjectTaskName || "未关联"}</DetailItem>}
      {work.sourceType === "meeting" && <DetailItem label="来源会议">{work.sourceMeetingTitle || "未关联"}</DetailItem>}
      {work.sourceType === "meeting" && <DetailItem label="会议决议">{work.sourceMeetingDecisionTitle || "未关联"}</DetailItem>}
      {work.sourceType === "meeting" && <DetailItem label="行动候选">{work.sourceMeetingActionCandidateTitle || "未关联"}</DetailItem>}
      </div>
    </PanelCard>
  );
}

function DetailItem({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs font-medium text-slate-400">{label}</div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}

function statusVariant(status: string) {
  if (status === "done") return "blue";
  if (status === "archived") return "orange";
  return "green";
}

function dateRange(startDate: string | null, dueDate: string | null) {
  if (!startDate && !dueDate) return "未设置";
  if (startDate && dueDate) return `${startDate} - ${dueDate}`;
  return startDate || dueDate;
}

function krRange(work: WorkItem) {
  const unit = work.krUnit || "";
  const value = (number: number | null) => number === null ? "未填" : `${number}${unit}`;
  return `${value(work.krStartValue)} / ${value(work.krCurrentValue)} / ${value(work.krTargetValue)}`;
}
