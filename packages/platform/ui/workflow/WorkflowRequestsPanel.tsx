"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createMasterDetailBody,
  createEmptySection,
  createFieldsSection,
  createListSection,
  createPageBody,
  PageSurface,
  type BodySurfaceBadgeSpec,
  type BodySurfaceCommandSpec,
  type BodySurfaceSectionSpec,
  type FormSurfaceReadOnlyFieldSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { postJson, putJson, requestJson } from "../api-client";
import {
  getWorkflowStatusLabel,
  getWorkflowStatusTone,
  type WorkflowFlowType,
} from "../WorkflowStatusBadge";
import { workflowRequestTimelineSectionSpec } from "./body-surface-adapters";
import type { WorkflowRequestTimelineEvent } from "./types";
import {
  getApprovalRequestEventLabel,
  type ApprovalRequestDescription,
} from "../../workflow-request-contract";

export type WorkflowRequestAction = "submit" | "withdraw" | "cancel" | "approve" | "reject";

export interface WorkflowRequestRecordLike {
  id: number | string;
  status: string;
  flowType?: WorkflowFlowType;
  version?: number | null;
  submitterUserId?: number | null;
  submitterName?: string | null;
  updatedAt?: string | null;
  requestCanWithdraw?: boolean;
  requestCanResubmit?: boolean;
  requestCanCancel?: boolean;
  handlerCanRevise?: boolean;
  canProcess?: boolean;
  description?: ApprovalRequestDescription;
  events?: readonly {
    id: number | string;
    eventType: string;
    actorName: string;
    createdAt: string;
    comment?: string | null;
  }[];
}

export interface WorkflowRequestPayloadSectionsContext<TRequest extends WorkflowRequestRecordLike> {
  request: TRequest;
  value: Record<string, unknown>;
  editable: boolean;
  saving: boolean;
  error: string | null;
  onChange: (value: Record<string, unknown>) => void;
  onSave: () => void;
}

export interface WorkflowRequestsPanelProps<TRequest extends WorkflowRequestRecordLike> {
  endpoint: string;
  responseKey?: string;
  title?: ReactNode;
  emptyText?: string;
  currentUserId: number;
  navigation?: PageSurfaceTabBarSpec;
  notify: (toast: { message: string; type: "success" | "error" }) => void;
  onCommitted?: () => void | Promise<void>;
  filterRequests?: (requests: TRequest[]) => TRequest[];
  requestTitle?: (request: TRequest) => ReactNode;
  requestDescription?: (request: TRequest) => ReactNode;
  requestFields: (request: TRequest) => FormSurfaceReadOnlyFieldSpec[];
  requestBadges?: (request: TRequest) => BodySurfaceBadgeSpec[];
  requestMeta?: (request: TRequest) => ReactNode;
  requestTimelineEvents?: (request: TRequest) => WorkflowRequestTimelineEvent[];
  canEditPayload?: (request: TRequest) => boolean;
  payloadValue?: (request: TRequest) => Record<string, unknown>;
  payloadText?: (request: TRequest) => string;
  requestPayloadSections?: (context: WorkflowRequestPayloadSectionsContext<TRequest>) => BodySurfaceSectionSpec[];
  parsePayloadText?: (text: string) => { ok: true; data: Record<string, unknown> } | { ok: false; error: string };
  updateBody?: (request: TRequest, data: Record<string, unknown>) => unknown;
  actionBody?: (request: TRequest, action: WorkflowRequestAction) => unknown;
}

export function WorkflowRequestsPage<TRequest extends WorkflowRequestRecordLike>(
  props: WorkflowRequestsPanelProps<TRequest>,
) {
  const { body, toolbarItems } = useWorkflowRequestsPageModel(props);
  return (
    <PageSurface
      kind="standard"
      tabbar={props.navigation}
      toolbar={{ items: toolbarItems }}
      body={body}
    />
  );
}

export function useWorkflowRequestsSection<TRequest extends WorkflowRequestRecordLike>(
  props: WorkflowRequestsPanelProps<TRequest>,
): BodySurfaceSectionSpec {
  const { body } = useWorkflowRequestsPageModel(props);
  return {
    key: "workflow-requests",
    label: props.title ?? "流程记录",
    body,
  };
}

function useWorkflowRequestsPageModel<TRequest extends WorkflowRequestRecordLike>({
  endpoint,
  responseKey = "requests",
  emptyText = "暂无流程记录",
  currentUserId,
  notify,
  onCommitted,
  filterRequests,
  requestTitle = defaultRequestTitle,
  requestDescription = defaultRequestDescription,
  requestFields,
  requestBadges = defaultRequestBadges,
  requestMeta = defaultRequestMeta,
  requestTimelineEvents = defaultRequestTimelineEvents,
  canEditPayload = () => false,
  payloadValue,
  payloadText = () => "",
  requestPayloadSections,
  parsePayloadText = parseJsonObject,
  updateBody = (request, data) => ({ payload: data, version: request.version }),
  actionBody = (request) => ({ version: request.version }),
}: WorkflowRequestsPanelProps<TRequest>) {
  const [requests, setRequests] = useState<TRequest[]>([]);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftPayloadValue, setDraftPayloadValue] = useState<Record<string, unknown>>({});
  const [draftPayloadText, setDraftPayloadText] = useState("");
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<Record<string, unknown>>(endpoint, { fallbackMessage: "加载流程记录失败" });
      const nextRequests = Array.isArray(data[responseKey]) ? data[responseKey] as TRequest[] : [];
      setRequests(nextRequests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载流程记录失败");
    } finally {
      setLoading(false);
    }
  }, [endpoint, responseKey]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const visibleRequests = useMemo(
    () => filterRequests ? filterRequests(requests) : requests,
    [filterRequests, requests],
  );
  const selectedRequest = visibleRequests.find((request) => request.id === selectedId) ?? visibleRequests[0] ?? null;

  useEffect(() => {
    if (!selectedRequest) {
      setDraftPayloadValue({});
      setDraftPayloadText("");
      setPayloadError(null);
      return;
    }
    const nextValue = payloadValue ? payloadValue(selectedRequest) : payloadValueFromText(payloadText(selectedRequest));
    setDraftPayloadValue(nextValue);
    setDraftPayloadText(payloadText(selectedRequest));
    setPayloadError(null);
  }, [payloadText, payloadValue, selectedRequest]);

  async function runAction(request: TRequest, action: WorkflowRequestAction) {
    setSaving(true);
    try {
      await postJson(`${endpoint}/${request.id}/${action}`, actionBody(request, action), `${workflowActionLabel(action)}失败`);
      notify({ type: "success", message: workflowActionSuccessLabel(action) });
      await loadRequests();
      if (action === "approve") await onCommitted?.();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : `${workflowActionLabel(action)}失败` });
    } finally {
      setSaving(false);
    }
  }

  async function savePayloadUpdate(request: TRequest, data: Record<string, unknown>) {
    setSaving(true);
    setPayloadError(null);
    try {
      await putJson(`${endpoint}/${request.id}`, updateBody(request, data), "保存处理修改失败");
      notify({ type: "success", message: "处理修改已保存" });
      await loadRequests();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存处理修改失败" });
    } finally {
      setSaving(false);
    }
  }

  const listSection = createListSection("workflow-request-list", {
    density: "compact",
    items: visibleRequests.map((request) => ({
      key: request.id,
      title: requestTitle(request),
      description: requestDescription(request),
      meta: requestMeta(request),
      badges: requestBadges(request),
      actions: requestActions({
        request,
        currentUserId,
        saving,
        onAction: (action) => void runAction(request, action),
      }),
      onClick: () => setSelectedId(request.id),
      tone: request.id === selectedRequest?.id ? "info" : "default",
    })),
    empty: {
      presentation: "plain",
      content: loading ? "正在加载流程记录" : error || emptyText,
    },
  });

  const detailSections: BodySurfaceSectionSpec[] = [];

  if (selectedRequest) {
    const payloadEditable = canEditPayload(selectedRequest);
    if (requestPayloadSections) {
      detailSections.push(...requestPayloadSections({
        request: selectedRequest,
        value: draftPayloadValue,
        editable: payloadEditable,
        saving,
        error: payloadError,
        onChange: (value) => {
          setDraftPayloadValue(value);
          setDraftPayloadText(JSON.stringify(value, null, 2));
          if (payloadError) setPayloadError(null);
        },
        onSave: () => void savePayloadUpdate(selectedRequest, draftPayloadValue),
      }));
    }
    detailSections.push(
      createFieldsSection("workflow-request-detail", requestFields(selectedRequest), {
        kind: "detail",
        layout: { columns: 3 },
      }),
    );
    if (!requestPayloadSections && payloadEditable) {
      detailSections.push(createFieldsSection("workflow-request-payload", [{
        key: "payload",
        label: "处理修改",
        spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "normal" },
        value: draftPayloadText,
        error: payloadError ?? undefined,
        span: "wide",
        rows: 8,
        onChange: (value) => {
          setDraftPayloadText(String(value ?? ""));
          if (payloadError) setPayloadError(null);
        },
      }], {
        layout: { columns: 1 },
        actions: [{
          key: "save-payload-update",
          action: "revise",
          label: "保存处理修改",
          disabled: saving,
          onClick: () => {
            const parsed = parsePayloadText(draftPayloadText);
            if (!parsed.ok) {
              setPayloadError(parsed.error);
              return;
            }
            void savePayloadUpdate(selectedRequest, parsed.data);
          },
        }],
      }));
    }
    detailSections.push(workflowRequestTimelineSectionSpec("workflow-request-timeline", requestTimelineEvents(selectedRequest)));
  }

  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "action-group",
      key: "workflow-actions",
      actions: [{
        key: "refresh-workflow",
        label: loading ? "刷新中" : "刷新",
        kind: "refresh",
        disabled: loading || saving,
        onClick: () => void loadRequests(),
      }],
    },
  ];

  return {
    toolbarItems,
    body: createMasterDetailBody({
      master: { label: "流程列表", body: createPageBody([listSection]) },
      detail: createPageBody(detailSections.length > 0 ? detailSections : [
        createEmptySection("workflow-request-empty", {
          presentation: "plain",
          content: visibleRequests.length > 0 ? "请选择左侧流程记录" : emptyText,
        }),
      ]),
      desktop: { ratio: [3, 7] },
    }),
  };
}

function requestActions<TRequest extends WorkflowRequestRecordLike>({
  request,
  currentUserId,
  saving,
  onAction,
}: {
  request: TRequest;
  currentUserId: number;
  saving: boolean;
  onAction: (action: WorkflowRequestAction) => void;
}): BodySurfaceCommandSpec[] {
  const isOwner = request.submitterUserId === currentUserId;
  if (isOwner && (request.status === "draft" || request.status === "withdrawn" || (request.status === "rejected" && request.requestCanResubmit))) {
    const actions: BodySurfaceCommandSpec[] = [
      { key: "submit", label: "提交", icon: "send", variant: "primary", size: "sm", disabled: saving, onClick: () => onAction("submit") },
    ];
    if (request.status === "draft" || request.status === "withdrawn") {
      actions.push({
        key: "cancel",
        label: "删除请求",
        icon: "delete-bin",
        variant: "danger",
        size: "sm",
        disabled: saving || !request.requestCanCancel,
        onClick: () => onAction("cancel"),
      });
    }
    return actions;
  }
  if (isOwner && request.status === "submitted") {
    return [{
      key: "withdraw",
      label: "撤回",
      icon: "withdraw",
      variant: "secondary",
      size: "sm",
      disabled: saving || !request.requestCanWithdraw,
      onClick: () => onAction("withdraw"),
    }];
  }
  if (request.canProcess === true && request.status === "submitted") {
    return [
      { key: "approve", label: "同意", icon: "approve", variant: "primary", size: "sm", disabled: saving, onClick: () => onAction("approve") },
      { key: "reject", label: "驳回", icon: "reject", variant: "danger", size: "sm", disabled: saving, onClick: () => onAction("reject") },
    ];
  }
  return [];
}

function defaultRequestBadges(request: WorkflowRequestRecordLike): BodySurfaceBadgeSpec[] {
  return [{ key: "status", label: getWorkflowStatusLabel(request.status), tone: getWorkflowStatusTone(request.status) }];
}

function defaultRequestMeta(request: WorkflowRequestRecordLike) {
  const submitter = request.submitterName || "未知发起人";
  return `${submitter} · ${formatDateTime(request.updatedAt)}`;
}

function defaultRequestTitle(request: WorkflowRequestRecordLike) {
  return request.description?.title || `流程 #${request.id}`;
}

function defaultRequestDescription(request: WorkflowRequestRecordLike) {
  return request.description?.summary || "";
}

function defaultRequestTimelineEvents(request: WorkflowRequestRecordLike): WorkflowRequestTimelineEvent[] {
  return (request.events ?? []).map((event) => ({
    id: event.id,
    actor: event.actorName,
    type: getApprovalRequestEventLabel(event.eventType),
    at: formatWorkflowDateTime(event.createdAt),
    comment: event.comment,
  }));
}

export function workflowActionLabel(action: WorkflowRequestAction) {
  if (action === "submit") return "提交";
  if (action === "withdraw") return "撤回";
  if (action === "cancel") return "删除请求";
  if (action === "approve") return "同意";
  if (action === "reject") return "驳回";
  return "操作";
}

export function workflowActionSuccessLabel(action: WorkflowRequestAction) {
  if (action === "submit") return "流程已提交";
  if (action === "withdraw") return "流程已撤回";
  if (action === "cancel") return "请求已删除";
  if (action === "approve") return "流程已通过";
  if (action === "reject") return "流程已驳回";
  return "流程已更新";
}

export function formatWorkflowDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDateTime(value: string | null | undefined) {
  return formatWorkflowDateTime(value);
}

function parseJsonObject(text: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "处理修改必须是对象 JSON" };
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "JSON 格式无效" };
  }
}

function payloadValueFromText(text: string) {
  const parsed = parseJsonObject(text || "{}");
  return parsed.ok ? parsed.data : {};
}
