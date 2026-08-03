"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createFieldsSection,
  createFormSection,
  createPageBody,
  createSectionSection,
  createStatusSection,
  BodySurface,
  useFeedback,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import { workflowActionSurfaceActions, workflowRequestTimelineSectionSpec } from "@workspace/platform/ui";
import {
  approveWorkTaskSubmission,
  commentWorkTaskSubmission,
  fetchWorkTaskSubmission,
  rejectWorkTaskSubmission,
} from "./api";
import {
  actionSuccessLabel,
  approvalActionViewModel,
  approvalTimelineEvents,
  formatDateTime,
} from "./WorkApprovalDisplay";
import { createEmptyWorkPlanDraft } from "./model";
import { useWorkOkrPlanSurface } from "./WorkOkrPlanSurface";
import type { WorkItem, WorkPlanDraft, WorkTaskApprovalRequest, WorkTarget, WorkTargetType } from "./types";

export default function WorkApprovalInboxDetail({
  requestId,
  currentUserId,
  onChanged,
  onBack,
}: {
  requestId: number;
  currentUserId: number;
  onChanged: () => void;
  onBack?: () => void;
}) {
  const feedback = useFeedback();
  const [request, setRequest] = useState<WorkTaskApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const snapshot = approvalSnapshot(request);
  const target = snapshotTarget(snapshot);
  const planDraft = useMemo(() => planDraftFromSnapshot(snapshot), [snapshot]);
  const works = useMemo(() => workItemsFromSnapshot(snapshot), [snapshot]);
  const okrPlanSurface = useWorkOkrPlanSurface({
    planDraft,
    works,
    target,
    persistenceMode: "workflowDraft",
    editability: "readonly",
    onPlanDraftChange: () => undefined,
    table: {
      sectionKey: "approval-okr-items",
      emptyText: "暂无目标/KR/任务快照",
      loading,
      canEdit: false,
      canDelete: false,
      saving,
      detailId,
      editingId: null,
      editDraft: null,
      statusFilter: "active",
      itemTypeFilter: "all",
      groupByObjective: true,
      onDetail: (work) => setDetailId((current) => current === work.id ? null : work.id),
      onEdit: () => undefined,
      onSave: async () => undefined,
      onCancelEdit: () => undefined,
      onEditDraftChange: () => undefined,
      onDelete: () => undefined,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequest(await fetchWorkTaskSubmission(requestId));
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "加载审批失败");
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [feedback, requestId]);

  useEffect(() => { void load(); }, [load]);

  const runAction = useCallback(async (action: "approve" | "reject") => {
    if (!request) return;
    setSaving(true);
    try {
      if (action === "approve") await approveWorkTaskSubmission(request.id, request.version, commentText);
      if (action === "reject") await rejectWorkTaskSubmission(request.id, request.version, commentText);
      feedback.success(actionSuccessLabel(action));
      setCommentText("");
      await load();
      onChanged();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "审批动作失败");
    } finally {
      setSaving(false);
    }
  }, [commentText, feedback, load, onChanged, request]);

  const submitComment = useCallback(async () => {
    if (!request || !commentText.trim()) return;
    setSaving(true);
    try {
      await commentWorkTaskSubmission(request.id, commentText, request.version);
      feedback.success("评论已提交");
      setCommentText("");
      await load();
      onChanged();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "提交评论失败");
    } finally {
      setSaving(false);
    }
  }, [commentText, feedback, load, onChanged, request]);

  const actionViewModel = request ? approvalActionViewModel({
    request,
    currentUserId,
    canEditPayload: false,
    saving,
    onAction: (action) => {
      if (action === "approve" || action === "reject") void runAction(action);
    },
  }) : null;
  const body = createPageBody(loading && !request
    ? [createStatusSection("approval-loading", { kind: "loading", content: "加载审批中..." })]
    : !request
      ? [createStatusSection("approval-empty", { kind: "empty", content: "这条审批已处理或不再需要你审批。" })]
      : [
          createSectionSection("approval-okr-plan", {
            title: "目标计划",
            actions: onBack ? [{ key: "back-to-list", label: "返回列表", icon: "back", onClick: onBack }] : undefined,
            sections: [
              createFormSection("approval-plan-form", {
                ...okrPlanSurface.planFormSurface,
                actions: actionViewModel ? workflowActionSurfaceActions(actionViewModel.commands) : undefined,
              }),
              ...okrPlanSurface.workSections,
              workflowRequestTimelineSectionSpec("approval-events", approvalTimelineEvents(request)),
              commentSection({ request, saving, commentText, onCommentChange: setCommentText, onSubmitComment: submitComment }),
            ],
          }),
        ]);

  return (
    <BodySurface {...body} />
  );
}

function commentSection({
  request,
  saving,
  commentText,
  onCommentChange,
  onSubmitComment,
}: {
  request: WorkTaskApprovalRequest;
  saving: boolean;
  commentText: string;
  onCommentChange: (value: string) => void;
  onSubmitComment: () => void;
}): BodySurfaceSectionSpec {
  return createFieldsSection("approval-comment", [{
    key: "comment",
    label: "审批意见",
    spec: { valueType: "string", control: "text", multiline: true, state: saving || request.status !== "submitted" ? "disabled" : "normal" },
    value: commentText,
    placeholder: "填写审批意见或补充说明",
    onChange: (value) => onCommentChange(String(value ?? "")),
    span: "wide",
  }], {
    layout: { columns: 1 },
    actions: [{
      key: "submit-comment",
      action: "send",
      label: "评论",
      disabled: saving || !commentText.trim() || request.status !== "submitted",
      onClick: onSubmitComment,
    }],
  });
}

function approvalSnapshot(request: WorkTaskApprovalRequest | null) {
  return objectValue(request?.latestPayload.data.approvalSnapshot);
}

function snapshotTarget(snapshot: Record<string, unknown> | null): WorkTarget | null {
  const plan = objectValue(snapshot?.plan);
  const targetType = stringValue(plan?.targetType);
  const targetId = numberValue(plan?.targetId);
  if ((targetType === "personal" || targetType === "company" || targetType === "committee" || targetType === "department" || targetType === "project") && targetId) {
    return { targetType, targetId };
  }
  return null;
}

function planDraftFromSnapshot(snapshot: Record<string, unknown> | null): WorkPlanDraft {
  const plan = objectValue(snapshot?.plan);
  const draft = createEmptyWorkPlanDraft();
  return {
    ...draft,
    title: stringValue(plan?.title),
    description: stringValue(plan?.description),
    status: planStatus(plan?.status),
    okrCycleId: numberValue(plan?.okrCycleId),
    okrCycleLabel: stringValue(objectValue(snapshot?.cycle)?.label) || stringValue(objectValue(snapshot?.cycle)?.code),
    parentPeriodPlanId: numberValue(plan?.parentPeriodPlanId),
    parentPeriodPlanTitle: stringValue(plan?.parentPeriodPlanTitle),
    parentPeriodPlanCycleLabel: stringValue(plan?.parentPeriodPlanCycleLabel),
    alignmentSourceType: alignmentSourceType(plan?.alignmentSourceType),
    alignmentSourcePlanId: numberValue(plan?.alignmentSourcePlanId),
    alignmentSourcePlanTitle: stringValue(plan?.alignmentSourcePlanTitle),
    alignmentSourcePlanTargetType: workTargetType(plan?.alignmentSourcePlanTargetType),
    alignmentSourcePlanTargetId: numberValue(plan?.alignmentSourcePlanTargetId),
    alignmentSourcePlanCycleLabel: stringValue(plan?.alignmentSourcePlanCycleLabel),
    alignmentSourceWorkItemId: numberValue(plan?.alignmentSourceWorkItemId),
    alignmentSourceWorkItemContent: stringValue(plan?.alignmentSourceWorkItemContent),
    alignmentSourceWorkItemTargetType: workTargetType(plan?.alignmentSourceWorkItemTargetType),
    alignmentSourceWorkItemTargetId: numberValue(plan?.alignmentSourceWorkItemTargetId),
    alignmentSourceWorkItemCycleLabel: stringValue(plan?.alignmentSourceWorkItemCycleLabel),
    alignmentSourceWorkItemPlanTitle: stringValue(plan?.alignmentSourceWorkItemPlanTitle),
    alignmentSourceWorkItemKrTargetValue: numberValue(plan?.alignmentSourceWorkItemKrTargetValue),
    alignmentSourceWorkItemKrUnit: stringValue(plan?.alignmentSourceWorkItemKrUnit),
    alignmentRelationKind: alignmentRelationKind(plan?.alignmentRelationKind),
    previousPeriodPlanId: numberValue(plan?.previousPeriodPlanId),
    previousPeriodPlanTitle: stringValue(plan?.previousPeriodPlanTitle),
    previousPeriodPlanCycleLabel: stringValue(plan?.previousPeriodPlanCycleLabel),
    periodType: periodType(plan?.periodType),
    actualStartDate: dateOnly(plan?.actualStartDate),
    actualEndDate: dateOnly(plan?.actualEndDate),
    plannedStartDate: dateOnly(plan?.plannedStartDate),
    plannedEndDate: dateOnly(plan?.plannedEndDate),
    isMilestone: plan?.isMilestone === true,
    milestoneDate: dateOnly(plan?.milestoneDate),
    sourceType: sourceType(plan?.sourceType),
    sortOrder: numberValue(plan?.sortOrder) ?? 0,
  };
}

function workItemsFromSnapshot(snapshot: Record<string, unknown> | null): WorkItem[] {
  const plan = objectValue(snapshot?.plan);
  const target = snapshotTarget(snapshot);
  const items = Array.isArray(snapshot?.items) ? snapshot.items.map(objectValue).filter(isRecord) : [];
  return items.map((item, index) => {
    const itemType = workItemType(item.itemType);
    const status = itemType === "objective" || itemType === "key_result" ? null : workItemStatus(item.status);
    return {
      id: numberValue(item.id) ?? index + 1,
      planId: numberValue(plan?.id),
      targetType: target?.targetType ?? "department",
      targetId: target?.targetId ?? 0,
      category: "non-routine",
      itemType,
      content: stringValue(item.content),
      description: stringValue(item.description),
      importance: 3,
      urgency: 3,
      status,
      krStartValue: numberValue(item.krStartValue),
      krTargetValue: numberValue(item.krTargetValue),
      krCurrentValue: numberValue(item.krCurrentValue),
      krUnit: stringValue(item.krUnit),
      routineTaskType: null,
      routineRecurrenceType: null,
      routineRecurrenceTime: null,
      routineRecurrenceWeekday: null,
      routineRecurrenceMonthDay: null,
      routineRecurrenceQuarterDay: null,
      routineRecurrenceYearMonth: null,
      routineRecurrenceYearDay: null,
      ownerEmployeeId: numberValue(item.ownerEmployeeId),
      ownerEmployeeNumber: null,
      ownerEmployeeName: stringValue(item.ownerEmployeeName) || null,
      collaborationId: numberValue(item.collaborationId),
      collaborationTitle: stringValue(item.collaborationTitle) || null,
      collaborationResponsibleDepartmentId: numberValue(item.collaborationResponsibleDepartmentId),
      collaborationResponsibleDepartmentName: stringValue(item.collaborationResponsibleDepartmentName) || null,
      actualStartDate: dateOnly(item.actualStartDate),
      actualEndDate: dateOnly(item.actualEndDate),
      plannedStartDate: dateOnly(item.plannedStartDate),
      plannedEndDate: dateOnly(item.plannedEndDate),
      isMilestone: item.isMilestone === true,
      milestoneDate: dateOnly(item.milestoneDate),
      completedAt: stringValue(item.completedAt) || null,
      periodType: periodType(item.periodType),
      periodStart: dateOnly(item.periodStart),
      periodEnd: dateOnly(item.periodEnd),
      sourceType: sourceType(item.sourceType),
      sourceKind: null,
      sourceMeetingId: null,
      sourceMeetingTitle: null,
      sourceMeetingStartAt: null,
      sourceMeetingDecisionId: null,
      sourceMeetingDecisionTitle: null,
      sourceMeetingDecisionKind: null,
      sourceMeetingActionCandidateId: null,
      sourceMeetingActionCandidateTitle: null,
      sourceDepartmentId: null,
      sourceDepartmentName: null,
      sourceDepartmentCode: null,
      linkedProjectId: null,
      linkedProjectName: null,
      linkedProjectCode: null,
      linkedProjectPhaseId: null,
      linkedProjectPhaseName: null,
      parentWorkItemId: numberValue(item.parentWorkItemId),
      parentWorkItemContent: stringValue(item.parentWorkItemContent) || null,
      parentPeriodWorkItemId: numberValue(item.parentPeriodWorkItemId),
      parentPeriodWorkItemContent: stringValue(item.parentPeriodWorkItemContent) || null,
      parentPeriodWorkItemType: null,
      parentPeriodWorkItemCycleLabel: stringValue(item.parentPeriodWorkItemCycleLabel) || null,
      parentPeriodWorkItemTargetType: null,
      parentPeriodWorkItemTargetId: null,
      parentPeriodWorkItemKrTargetValue: null,
      parentPeriodWorkItemKrCurrentValue: null,
      parentPeriodWorkItemKrUnit: null,
      previousPeriodWorkItemId: numberValue(item.previousPeriodWorkItemId),
      previousPeriodWorkItemContent: stringValue(item.previousPeriodWorkItemContent) || null,
      previousPeriodWorkItemCycleLabel: stringValue(item.previousPeriodWorkItemCycleLabel) || null,
      responsibilityReferenceId: null,
      responsibilityNodeId: numberValue(item.responsibilityNodeId),
      responsibilityLabel: stringValue(item.responsibilityLabel) || null,
      responsibilityPathLabel: null,
      responsibilityTitle: null,
      responsibilityContent: null,
      responsibilityLockedEmployeeId: numberValue(item.ownerEmployeeId),
      responsibilityPositionId: numberValue(item.responsibilityPositionId),
      responsibilityPositionName: stringValue(item.responsibilityPositionName) || null,
      evidenceTaskIds: [],
      isArchived: false,
      isPrivate: false,
      participants: [],
      sortOrder: numberValue(item.sortOrder) ?? index * 10,
      createdAt: stringValue(item.createdAt) || formatDateTime(null),
      updatedAt: stringValue(item.updatedAt) || formatDateTime(null),
    };
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isRecord(value: Record<string, unknown> | null): value is Record<string, unknown> {
  return Boolean(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : null;
}

function planStatus(value: unknown): WorkPlanDraft["status"] {
  return value === "done" ? value : "active";
}

function periodType(value: unknown): WorkPlanDraft["periodType"] {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "quarterly" || value === "half_year" || value === "yearly" ? value : null;
}

function alignmentSourceType(value: unknown): WorkPlanDraft["alignmentSourceType"] {
  return value === "plan" || value === "objective" || value === "key_result" ? value : null;
}

function alignmentRelationKind(value: unknown): WorkPlanDraft["alignmentRelationKind"] {
  return value === "upper" || value === "external" ? value : null;
}

function workTargetType(value: unknown): WorkTargetType | null {
  return value === "personal" || value === "company" || value === "committee" || value === "department" || value === "project" ? value : null;
}

function sourceType(value: unknown): WorkPlanDraft["sourceType"] {
  return value === "department" || value === "project" || value === "meeting" ? value : "other";
}

function workItemType(value: unknown): WorkItem["itemType"] {
  return value === "objective" || value === "key_result" ? value : "task";
}

function workItemStatus(value: unknown): WorkItem["status"] {
  return value === "done" || value === "paused" ? value : "active";
}
