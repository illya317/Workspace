"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createFieldsSection,
  createListSection,
  createPanelSection,
  type BodySurfaceBadgeSpec,
  type BodySurfaceSectionSpec,
  type FormSurfaceReadOnlyFieldSpec,
} from "@workspace/core/ui";
import {
  actionRuntimeCommands,
  type WorkflowActionViewModel,
  type WorkflowRequestTimelineEvent,
  workflowActionSlotSectionSpec,
  workflowRequestTimelineSectionSpec,
} from "../../workflow";
import { resolveActionRuntime } from "@workspace/platform/workflow-action-runtime";
import {
  getWorkflowStatusLabel,
  getWorkflowStatusTone,
  normalizeWorkflowStatus,
} from "../../WorkflowStatusBadge";
import {
  approveEditorTemplateSubmission,
  cancelEditorTemplateSubmission,
  listEditorTemplateSubmissions,
  rejectEditorTemplateSubmission,
  reviseEditorTemplateSubmission,
  submitEditorTemplateSubmission,
  withdrawEditorTemplateSubmission,
  type EditorSpaceDto,
  type EditorTemplateWorkflowRequest,
} from "./api";
import { docsWorkflowTargetType } from "./workflow-actions";

type WorkflowAction = "submit" | "withdraw" | "cancel" | "approve" | "reject";

export function useDocsEditorWorkflowSection({
  activeSpace,
  currentUserId,
  focusRequestId,
  onToast,
  onCommitted,
}: {
  activeSpace: EditorSpaceDto | null;
  currentUserId: number;
  focusRequestId?: number | null;
  onToast: (toast: { message: string; type: "success" | "error" }) => void;
  onCommitted: () => Promise<void>;
}): BodySurfaceSectionSpec {
  const [requests, setRequests] = useState<EditorTemplateWorkflowRequest[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(focusRequestId ?? null);
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(focusRequestId ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState("");
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const target = useMemo(() => {
    if (!activeSpace || focusRequestId) return null;
    const targetType = docsWorkflowTargetType(activeSpace.targetType);
    return targetType ? { targetType, targetId: activeSpace.targetId } : null;
  }, [activeSpace, focusRequestId]);

  const loadRequests = useCallback(async () => {
    if (!activeSpace && !pendingFocusId) {
      setRequests([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listEditorTemplateSubmissions(target);
      const next = data.requests || [];
      setRequests(next);
      setSelectedId((current) => {
        if (pendingFocusId && next.some((request) => request.id === pendingFocusId)) return pendingFocusId;
        return current && next.some((request) => request.id === current) ? current : next[0]?.id ?? null;
      });
      if (pendingFocusId) setPendingFocusId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载模板流程失败");
    } finally {
      setLoading(false);
    }
  }, [activeSpace, pendingFocusId, target]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (focusRequestId) {
      setPendingFocusId(focusRequestId);
      setSelectedId(focusRequestId);
    }
  }, [focusRequestId]);

  const selectedRequest = requests.find((request) => request.id === selectedId) ?? requests[0] ?? null;

  useEffect(() => {
    setPayloadText(selectedRequest ? stringifyPayloadData(selectedRequest.latestPayload.data) : "");
    setPayloadError(null);
  }, [selectedRequest]);

  async function runAction(request: EditorTemplateWorkflowRequest, action: WorkflowAction) {
    setSaving(true);
    try {
      const comment = action === "reject" ? window.prompt("填写驳回原因") : null;
      if (action === "submit") await submitEditorTemplateSubmission(request.id, request.version);
      if (action === "withdraw") await withdrawEditorTemplateSubmission(request.id, request.version);
      if (action === "cancel") await cancelEditorTemplateSubmission(request.id, request.version);
      if (action === "approve") await approveEditorTemplateSubmission(request.id, request.version);
      if (action === "reject") await rejectEditorTemplateSubmission(request.id, request.version, comment?.trim() || null);
      if (action === "approve") await onCommitted();
      await loadRequests();
      onToast({ message: workflowActionSuccessLabel(action), type: "success" });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : `${workflowActionLabel(action)}失败`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function saveReviewUpdate(request: EditorTemplateWorkflowRequest) {
    const parsed = parsePayloadData(payloadText);
    if (!parsed.ok) {
      setPayloadError(parsed.error);
      return;
    }
    setSaving(true);
    setPayloadError(null);
    try {
      await reviseEditorTemplateSubmission(request.id, parsed.data, request.version);
      await loadRequests();
      onToast({ message: "处理修改已保存", type: "success" });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "保存处理修改失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const sections: BodySurfaceSectionSpec[] = [
    createListSection("docs-template-workflow-list", {
      density: "compact",
      items: requests.map((request) => ({
        key: request.id,
        title: requestTitle(request),
        description: requestDetail(request),
        meta: `${request.submitterName} · ${formatDateTime(request.updatedAt)}`,
        badges: requestBadges(request),
        onClick: () => setSelectedId(request.id),
        tone: request.id === selectedRequest?.id ? "info" : "default",
      })),
      empty: {
        presentation: "plain",
        content: loading ? "正在加载流程记录" : error || "暂无模板流程记录",
      },
    }),
  ];

  if (selectedRequest) {
    sections.push(workflowActionSlotSectionSpec("docs-template-workflow-action-slot", requestActionViewModel({
      request: selectedRequest,
      currentUserId,
      saving,
      onAction: (action) => void runAction(selectedRequest, action),
      onRevise: () => void saveReviewUpdate(selectedRequest),
    })));
    sections.push(...requestDetailSections(selectedRequest, {
      canEditPayload: canEditWorkflowPayload(selectedRequest, currentUserId),
      payloadText,
      payloadError,
      saving,
      onPayloadTextChange: (value) => {
        setPayloadText(value);
        if (payloadError) setPayloadError(null);
      },
      onSavePayload: () => void saveReviewUpdate(selectedRequest),
    }));
  }

  return createPanelSection("docs-template-workflow", {
    title: "流程记录",
    actions: [{
      key: "refresh-workflow",
      label: loading ? "刷新中" : "刷新",
      icon: "refresh",
      disabled: loading || saving,
      onClick: () => void loadRequests(),
    }],
    sections,
  });
}

function requestDetailSections(
  request: EditorTemplateWorkflowRequest,
  reviewEdit: {
    canEditPayload: boolean;
    payloadText: string;
    payloadError: string | null;
    saving: boolean;
    onPayloadTextChange: (value: string) => void;
    onSavePayload: () => void;
  },
): BodySurfaceSectionSpec[] {
  return [
    createFieldsSection("docs-template-workflow-detail", requestReadonlyFields(request), {
      kind: "detail",
      layout: { columns: 3 },
    }),
    ...(reviewEdit.canEditPayload ? [
      createFieldsSection("docs-template-workflow-review-update", [{
        key: "payload",
        label: "处理修改",
        spec: { valueType: "string", control: "text", multiline: true, state: reviewEdit.saving ? "disabled" : "normal" },
        value: reviewEdit.payloadText,
        error: reviewEdit.payloadError ?? undefined,
        span: "wide",
        rows: 8,
        onChange: (value) => reviewEdit.onPayloadTextChange(String(value ?? "")),
      }], {
        layout: { columns: 1 },
        actions: [{
          key: "save-review-update",
          action: "revise",
          label: "保存处理修改",
          disabled: reviewEdit.saving,
          onClick: reviewEdit.onSavePayload,
        }],
      }),
    ] : []),
    workflowRequestTimelineSectionSpec("docs-template-workflow-events", requestTimelineEvents(request)),
  ];
}

function requestReadonlyFields(request: EditorTemplateWorkflowRequest): FormSurfaceReadOnlyFieldSpec[] {
  return [
    readonlyField("operation", "类型", operationLabel(request)),
    readonlyField("status", "状态", getWorkflowStatusLabel(request.status)),
    readonlyField("submitter", "发起人", request.submitterName),
    readonlyField("version", "版本", `v${request.version}`),
    readonlyField("template", "模板", requestDetail(request)),
    readonlyField("updatedAt", "更新时间", formatDateTime(request.updatedAt)),
  ];
}

function requestActionViewModel({
  request,
  currentUserId,
  saving,
  onAction,
  onRevise,
}: {
  request: EditorTemplateWorkflowRequest;
  currentUserId: number;
  saving: boolean;
  onAction: (action: WorkflowAction) => void;
  onRevise: () => void;
}): WorkflowActionViewModel {
  return {
    businessActionKey: request.businessActionKey,
    flowType: request.flowType,
    mode: "workflow",
    status: normalizeWorkflowStatus(request.status),
    requestId: request.id,
    title: requestTitle(request),
    summary: `#${request.id} · ${requestDetail(request)} · ${request.version} 版`,
    placement: "formFooter",
    payloadMode: canEditWorkflowPayload(request, currentUserId) ? "editable" : "readonly",
    commands: requestCommands({ request, currentUserId, saving, onAction, onRevise }),
  };
}

function requestCommands({
  request,
  currentUserId,
  saving,
  onAction,
  onRevise,
}: {
  request: EditorTemplateWorkflowRequest;
  currentUserId: number;
  saving: boolean;
  onAction: (action: WorkflowAction) => void;
  onRevise: () => void;
}) {
  const runtime = resolveActionRuntime({
    businessActionKey: request.businessActionKey,
    workflowPolicyMode: "required",
    workflowWhenDisabled: "direct_write",
    actor: {
      userId: currentUserId,
      canProcessWorkflow: request.canProcess === true,
    },
    request,
  });
  return actionRuntimeCommands(runtime, {
    "workflow.request.submit": { disabled: saving, onClick: () => onAction("submit") },
    "workflow.request.resubmit": { disabled: saving, onClick: () => onAction("submit") },
    "workflow.request.withdraw": { disabled: saving, onClick: () => onAction("withdraw") },
    "workflow.request.revise": { disabled: saving, onClick: onRevise },
    "workflow.request.approve": { disabled: saving, onClick: () => onAction("approve") },
    "workflow.request.reject": { disabled: saving, onClick: () => onAction("reject") },
  });
}

function canEditWorkflowPayload(request: EditorTemplateWorkflowRequest, currentUserId: number) {
  if (request.status === "submitted") return request.canProcess === true && request.handlerCanRevise;
  return request.submitterUserId === currentUserId
    && (request.status === "withdrawn" || request.status === "rejected")
    && request.requestCanRevise;
}

function requestTimelineEvents(request: EditorTemplateWorkflowRequest): WorkflowRequestTimelineEvent[] {
  return request.events.map((event) => ({
    id: event.id,
    actor: event.actorName,
    type: eventLabel(event.eventType),
    at: formatDateTime(event.createdAt),
    comment: event.comment || undefined,
  }));
}

function requestBadges(request: EditorTemplateWorkflowRequest): BodySurfaceBadgeSpec[] {
  return [
    { key: "status", label: getWorkflowStatusLabel(request.status), tone: getWorkflowStatusTone(request.status) },
    { key: "action", label: actionLabel(request.latestPayload.action), tone: "muted" },
  ];
}

function requestTitle(request: EditorTemplateWorkflowRequest) {
  return `${operationLabel(request)} · ${requestDetail(request)}`;
}

function requestDetail(request: EditorTemplateWorkflowRequest) {
  return String(request.latestPayload.data.title || request.latestPayload.templateId || request.subjectId || "未命名模板");
}

function operationLabel(request: EditorTemplateWorkflowRequest) {
  if (request.latestPayload.action === "draft.create") return "新建模板";
  if (request.latestPayload.action === "publish") return "发布模板";
  return request.operation === "create" ? "新建模板" : "保存模板修改";
}

function actionLabel(action: string) {
  if (action === "draft.create") return "新建";
  if (action === "draft.save") return "保存";
  if (action === "publish") return "发布";
  return action;
}

function readonlyField(key: string, label: string, value: string): FormSurfaceReadOnlyFieldSpec {
  return { kind: "readonly", key, label, value };
}

function eventLabel(eventType: string) {
  if (eventType === "create_draft") return "创建草稿";
  if (eventType === "submit") return "提交";
  if (eventType === "withdraw") return "撤回";
  if (eventType === "revise") return "修订";
  if (eventType === "review_update") return "处理修改";
  if (eventType === "approve") return "同意";
  if (eventType === "review") return "复核";
  if (eventType === "publish") return "发布";
  if (eventType === "reject") return "驳回";
  if (eventType === "cancel") return "删除请求";
  if (eventType === "comment") return "评论";
  if (eventType === "commit_failed") return "提交正式数据失败";
  return eventType;
}

function workflowActionLabel(action: string) {
  if (action === "submit") return "提交";
  if (action === "withdraw") return "撤回";
  if (action === "cancel") return "删除请求";
  if (action === "approve") return "同意";
  if (action === "reject") return "驳回";
  return "操作";
}

function workflowActionSuccessLabel(action: string) {
  if (action === "submit") return "流程已提交";
  if (action === "withdraw") return "流程已撤回";
  if (action === "cancel") return "请求已删除";
  if (action === "approve") return "流程已通过";
  if (action === "reject") return "流程已驳回";
  return "流程已更新";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function stringifyPayloadData(data: Record<string, unknown>) {
  return JSON.stringify(data, null, 2);
}

function parsePayloadData(text: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "处理修改必须是对象 JSON" };
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "JSON 格式无效" };
  }
}
