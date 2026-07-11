"use client";

import type { BodySurfaceSectionSpec, FormSurfaceProps } from "@workspace/core/ui";
import { useWorkPlanFormSurface } from "./WorkPlanFields";
import { useWorkTaskTableSection, type WorkTaskTableProps } from "./WorkTaskTable";
import type { WorkStatusFilter } from "./work-status-filter";
import type { WorkItem, WorkPlanDraft, WorkTarget } from "./types";

export type WorkOkrPlanPersistenceMode = "active" | "workflowDraft" | "businessDraft";
export type WorkOkrPlanWorkflowRole = "none" | "submitter" | "processor" | "observer";
export type WorkOkrPlanEditability = "editable" | "readonly";

type WorkOkrPlanTableInput = Omit<
  WorkTaskTableProps,
  "works" | "sectionKey" | "sectionTitle" | "tableLabel" | "emptyText" | "canEdit" | "canSubmit" | "canDelete"
> & {
  sectionKey?: string;
  sectionTitle?: string;
  tableLabel?: string;
  emptyText?: string;
  canEdit: boolean;
  canSubmit?: boolean;
  canDelete: boolean;
  statusFilter: WorkStatusFilter;
  canEditWork?: (work: WorkItem) => boolean;
  canDeleteWork?: (work: WorkItem) => boolean;
};

export type WorkOkrPlanSurfaceResult = {
  planFormSurface: FormSurfaceProps;
  workSections: BodySurfaceSectionSpec[];
};

export function useWorkOkrPlanSurface({
  planDraft,
  works,
  target,
  persistenceMode,
  workflowRole,
  editability,
  formDisabled = false,
  autoFocusPlanTitle = false,
  onPlanDraftChange,
  table,
  extraSections = [],
}: {
  planDraft: WorkPlanDraft;
  works: WorkItem[];
  target: WorkTarget | null;
  persistenceMode: WorkOkrPlanPersistenceMode;
  workflowRole: WorkOkrPlanWorkflowRole;
  editability: WorkOkrPlanEditability;
  formDisabled?: boolean;
  autoFocusPlanTitle?: boolean;
  onPlanDraftChange: (draft: WorkPlanDraft) => void;
  table: WorkOkrPlanTableInput;
  extraSections?: BodySurfaceSectionSpec[];
}): WorkOkrPlanSurfaceResult {
  const readonly = editability === "readonly";
  const planFormSurface = useWorkPlanFormSurface({
    draft: planDraft,
    disabled: readonly || formDisabled,
    autoFocusTitle: autoFocusPlanTitle,
    target,
    onChange: readonly ? noopPlanDraftChange : onPlanDraftChange,
  });
  const canEditRows = !readonly && table.canEdit;
  const canSubmitRows = workflowRole === "submitter" && !readonly && Boolean(table.canSubmit);
  const canDeleteRows = !readonly && table.canDelete;
  const tableSection = useWorkTaskTableSection({
    ...table,
    works,
    sectionKey: table.sectionKey ?? surfaceTableSectionKey(persistenceMode),
    sectionTitle: table.sectionTitle ?? "目标分解",
    tableLabel: table.tableLabel ?? "目标 / 执行任务 / 考核结果",
    emptyText: table.emptyText ?? "暂无目标/KR/任务",
    canEdit: canEditRows,
    canSubmit: canSubmitRows,
    canDelete: canDeleteRows,
    canEditWork: readonly ? neverEditable : table.canEditWork,
    canDeleteWork: readonly ? neverEditable : table.canDeleteWork,
  });
  return { planFormSurface, workSections: [tableSection, ...extraSections] };
}

function surfaceTableSectionKey(mode: WorkOkrPlanPersistenceMode) {
  if (mode === "workflowDraft") return "approval-okr-items";
  if (mode === "businessDraft") return "draft-okr-items";
  return "okr-by-objective";
}

function noopPlanDraftChange(_: WorkPlanDraft) {
  return undefined;
}

function neverEditable(_: WorkItem) {
  return false;
}
