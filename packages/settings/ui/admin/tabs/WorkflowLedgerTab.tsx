"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMessageSection,
  createPageDataSection,
  type BodySurfaceProps,
  type BodySurfaceSectionSpec,
  type DataSurfaceStructuredCellSpec,
  type PageSurfaceFooterSpec,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";
import { requestJson } from "@workspace/platform/ui/api-client";
import { createAdminSelectorSplitBody } from "../components/AdminSelectorSplit";
import {
  DEFAULT_WORKFLOW_ACTION_FILTER,
  matchesWorkflowActionFilter,
  WORKFLOW_ACTION_FILTER_OPTIONS,
  type WorkflowActionFilter,
} from "./WorkflowActionFilterModel";
import {
  deriveActionTree,
  firstAction,
  formatDateTime,
  moduleDisplayName,
  type BusinessActionDto,
  type WorkflowActionTreeNode,
  type WorkflowFlowType,
  type WorkflowHandlerSource,
  type WorkflowPoliciesResponse,
  type WorkflowSeparationPolicy,
} from "./WorkflowPoliciesTabModel";

interface WorkflowLedgerRequest {
  id: number;
  businessActionKey: string;
  actionLabel: string;
  moduleLabel: string;
  resourceKey: string;
  resourceLabel: string;
  flowType: WorkflowFlowType;
  separationPolicy: WorkflowSeparationPolicy;
  handlerSource: WorkflowHandlerSource;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  subjectType: string;
  subjectId: string | null;
  operation: string;
  status: string;
  submitterUserId: number;
  submittedAt: string | null;
  resolvedByUserId: number | null;
  resolvedAt: string | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  scopeId: string | null;
  latestEventType: string | null;
  latestEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowLedgerResponse {
  requests: WorkflowLedgerRequest[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface UseWorkflowLedgerTabInput {
  enabled: boolean;
  showToast: (msg: string, type?: "success" | "error") => void;
}

const STATUS_LABEL: Record<string, string> = {
  all: "全部状态",
  draft: "草稿",
  submitted: "待处理",
  committing: "提交中",
  approved: "已通过",
  rejected: "已驳回",
  withdrawn: "已撤回",
  cancelled: "已取消",
};

const EVENT_LABEL: Record<string, string> = {
  create_draft: "创建草稿",
  submit: "提交",
  withdraw: "撤回",
  revise: "修订",
  review_update: "处理人修改",
  approve: "同意",
  review: "复核通过",
  publish: "发布通过",
  reject: "驳回",
  cancel: "取消",
  comment: "评论",
  commit_failed: "提交失败",
};

function statusTone(status: string): "green" | "red" | "orange" | "slate" {
  if (status === "approved") return "green";
  if (status === "rejected" || status === "cancelled") return "red";
  if (status === "submitted" || status === "committing") return "orange";
  return "slate";
}

function requestSubject(row: WorkflowLedgerRequest) {
  return row.subjectId ? `${row.subjectType} · ${row.subjectId}` : row.subjectType;
}

function committedEntity(row: WorkflowLedgerRequest) {
  if (!row.committedEntityType && !row.committedEntityId) return "未落库";
  return [row.committedEntityType, row.committedEntityId].filter(Boolean).join(" · ");
}

export function useWorkflowLedgerTab({ enabled, showToast }: UseWorkflowLedgerTabInput): {
  body: BodySurfaceProps;
  footer?: PageSurfaceFooterSpec;
  toolbarItems: SurfaceToolbarItem[];
} {
  const [settings, setSettings] = useState<WorkflowPoliciesResponse | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState<WorkflowActionFilter>(DEFAULT_WORKFLOW_ACTION_FILTER);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [selectedActionKey, setSelectedActionKey] = useState<string | null>(null);
  const [ledger, setLedger] = useState<WorkflowLedgerResponse>({ requests: [], page: 0, pageSize: 50, total: 0, totalPages: 1 });

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const next = await requestJson<WorkflowPoliciesResponse>("/api/settings/admin/workflow-policies", {
        fallbackMessage: "加载流程台账入口失败",
      });
      setSettings(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载流程台账入口失败", "error");
    } finally {
      setSettingsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!enabled || settings) return;
    void loadSettings();
  }, [enabled, loadSettings, settings]);

  const ledgerActions = useMemo(() => (
    (settings?.businessActions ?? []).filter((action) => (
      action.workflowReadiness.executionPath === "approval_request"
      && action.workflowReadiness.evidence.ledgerVisibility !== "not_applicable"
    ))
  ), [settings?.businessActions]);

  const filteredActions = useMemo(() => {
    return ledgerActions.filter((action) => {
      if (moduleFilter !== "all" && action.moduleKey !== moduleFilter) return false;
      return matchesWorkflowActionFilter(action, actionFilter);
    });
  }, [actionFilter, ledgerActions, moduleFilter]);

  const selectedAction = useMemo<BusinessActionDto | null>(() => (
    filteredActions.find((action) => action.key === selectedActionKey) ?? filteredActions[0] ?? null
  ), [filteredActions, selectedActionKey]);

  useEffect(() => {
    if (!selectedAction) {
      setSelectedActionKey(null);
      return;
    }
    setSelectedActionKey((current) => filteredActions.some((action) => action.key === current) ? current : selectedAction.key);
  }, [filteredActions, selectedAction]);

  useEffect(() => {
    setPage(0);
  }, [actionFilter, query, selectedAction?.key, status]);

  const ledgerNotApplicable = selectedAction?.workflowReadiness.evidence.ledgerVisibility === "not_applicable";

  useEffect(() => {
    if (!enabled || !selectedAction) return undefined;
    if (selectedAction.workflowReadiness.evidence.ledgerVisibility === "not_applicable") {
      setLedger({ requests: [], page: 0, pageSize, total: 0, totalPages: 1 });
      return undefined;
    }
    const selectedBusinessActionKey = selectedAction.key;
    const controller = new AbortController();
    async function loadLedger() {
      const params = new URLSearchParams();
      params.set("businessActionKey", selectedBusinessActionKey);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (status !== "all") params.set("status", status);
      if (query.trim()) params.set("query", query.trim());
      try {
        const response = await fetch(workspacePath(`/api/settings/admin/workflow-ledger?${params.toString()}`), { signal: controller.signal });
        if (!response.ok) {
          showToast(`加载流程台账失败: ${response.status}`, "error");
          return;
        }
        setLedger(await response.json() as WorkflowLedgerResponse);
      } catch {
        if (!controller.signal.aborted) showToast("加载流程台账失败", "error");
      }
    }
    void loadLedger();
    return () => controller.abort();
  }, [enabled, page, pageSize, query, selectedAction, showToast, status]);

  const moduleOptions = useMemo(() => {
    const modules = new Map<string, string>();
    for (const action of ledgerActions) {
      modules.set(action.moduleKey, moduleDisplayName(action));
    }
    return [
      { value: "all", label: "全部模块" },
      ...Array.from(modules.entries())
        .sort(([, leftLabel], [, rightLabel]) => leftLabel.localeCompare(rightLabel, "zh-CN"))
        .map(([moduleKey, label]) => ({ value: moduleKey, label })),
    ];
  }, [ledgerActions]);

  const actionTree = useMemo(
    () => deriveActionTree(filteredActions, settings?.policies ?? [], settings?.workflowCategories ?? []),
    [filteredActions, settings?.policies, settings?.workflowCategories],
  );

  const rows = useMemo<DataSurfaceStructuredCellSpec[][]>(() => [
    [
      { content: "更新时间", header: true, width: "lg" },
      { content: "状态", header: true, width: "sm" },
      { content: "对象", header: true, width: "lg" },
      { content: "发起人", header: true, width: "sm" },
      { content: "处理人", header: true, width: "sm" },
      { content: "落库对象", header: true, width: "lg" },
      { content: "最近事件", header: true, width: "lg" },
      { content: "上下文", header: true, width: "lg" },
    ],
    ...ledger.requests.map((row): DataSurfaceStructuredCellSpec[] => [
      { content: { kind: "text", value: formatDateTime(row.updatedAt), font: "mono", tone: "muted" } },
      { content: { kind: "badge", label: STATUS_LABEL[row.status] ?? row.status, tone: statusTone(row.status) } },
      {
        content: {
          kind: "stack",
          gap: "xs",
          items: [
            { kind: "text", value: `#${row.id} · ${row.operation}`, emphasis: "medium" },
            { kind: "text", value: requestSubject(row), font: "mono", tone: "muted" },
          ],
        },
      },
      { content: { kind: "text", value: String(row.submitterUserId), font: "mono" } },
      { content: row.resolvedByUserId ? { kind: "text", value: String(row.resolvedByUserId), font: "mono" } : { kind: "empty", content: "未处理" } },
      { content: { kind: "text", value: committedEntity(row), font: row.committedEntityId ? "mono" : undefined, tone: row.committedEntityId ? "default" : "muted" } },
      { content: row.latestEventType
        ? { kind: "text", value: `${EVENT_LABEL[row.latestEventType] ?? row.latestEventType} · ${row.latestEventAt ? formatDateTime(row.latestEventAt) : ""}` }
        : { kind: "empty", content: "暂无事件" } },
      { content: row.scopeId ? { kind: "text", value: row.scopeId, font: "mono", tone: "muted" } : { kind: "empty", content: "无空间上下文" } },
    ]),
  ], [ledger.requests]);

  const sections: BodySurfaceSectionSpec[] = (() => {
    if (settingsLoading || !settings) {
      return [createMessageSection("workflow-ledger-loading", { content: settingsLoading ? "加载流程台账..." : "暂无流程台账数据", tone: "muted" })];
    }
    if (!selectedAction) {
      return [createMessageSection("workflow-ledger-empty", { content: "暂无流程行为", tone: "muted" })];
    }
    return [
      ledgerNotApplicable
        ? createMessageSection("workflow-ledger-not-applicable", { content: "该动作使用业务原生状态，不生成 ApprovalRequest，因此不进入通用流程台账。", tone: "muted" })
        : ledger.requests.length > 0 ? createPageDataSection("workflow-ledger-requests", {
            kind: "structured",
            rows,
            structuredScroll: true,
            scroll: { x: true, y: "auto", maxHeight: "lg" },
            presentation: { density: "compact", cellWrap: "nowrap" },
          }) : null,
    ].filter(Boolean) as BodySurfaceSectionSpec[];
  })();

  const toolbarItems: SurfaceToolbarItem[] = [
    {
      kind: "search",
      key: "workflow-ledger-search",
      value: query,
      onChange: setQuery,
      placeholder: "搜索记录",
      ariaLabel: "搜索流程台账",
    },
    {
      kind: "option-group",
      key: "workflow-ledger-module",
      label: "模块",
      value: moduleFilter,
      options: moduleOptions,
      onChange: setModuleFilter,
      ariaLabel: "筛选流程台账模块",
      presentation: "accordion",
    },
    {
      kind: "option-group",
      key: "workflow-ledger-eligibility",
      label: "类型",
      value: actionFilter,
      options: WORKFLOW_ACTION_FILTER_OPTIONS,
      onChange: (value) => setActionFilter(value as WorkflowActionFilter),
      ariaLabel: "筛选流程台账类型",
      presentation: "accordion",
    },
    {
      kind: "option-group",
      key: "workflow-ledger-status",
      label: "状态",
      value: status,
      options: ["all", "draft", "submitted", "approved", "rejected", "withdrawn", "cancelled"].map((value) => ({ value, label: STATUS_LABEL[value] ?? value })),
      onChange: setStatus,
      ariaLabel: "筛选流程状态",
      presentation: "accordion",
    },
    {
      kind: "page-size",
      key: "workflow-ledger-page-size",
      label: "分页",
      value: String(pageSize),
      options: [20, 50, 100].map((value) => ({ value: String(value), label: `${value}条/页` })),
      onChange: (value) => {
        setPageSize(Number(value));
        setPage(0);
      },
    },
  ];

  const body: BodySurfaceProps = createAdminSelectorSplitBody<WorkflowActionTreeNode>({
    title: "流程台账",
    items: actionTree,
    selectedId: selectedAction?.key ?? null,
    sections,
    onSelect: (node) => {
      const action = firstAction(node);
      if (!action) return;
      setSelectedActionKey(action.key);
      setPage(0);
    },
    emptyContent: "暂无流程行为",
  });

  const footer: PageSurfaceFooterSpec | undefined = ledger.total > pageSize
    ? {
        pagination: {
          page,
          totalPages: ledger.totalPages,
          total: ledger.total,
          onPageChange: setPage,
        },
      }
    : undefined;

  return { body, footer, toolbarItems };
}
