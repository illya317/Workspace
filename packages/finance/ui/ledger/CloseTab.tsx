"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceColumnSpec,
  type DataSurfaceRowActionSpec,
  type PageSurfaceTabBarSpec,
} from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FinanceCloseScope,
  FinanceCloseTaskDto,
  FinanceCloseTaskStatus,
  FinanceCloseWorkspaceDto,
} from "../../types/close";
import { FINANCE_CLOSE_WORKPAPER_TASK_KEYS } from "../../types/close";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import {
  createCurrentValueTracker,
  createLatestRequestGate,
  financeUiRequestScopeKey,
  financeUiResponseMatchesScope,
} from "../components/latest-request-gate";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import {
  FINANCE_CLOSE_TASK_COUNT,
  financeCloseBusinessMessage,
  financeCloseBusinessReferences,
  financeCloseOpenIdempotencyKey,
  financeCloseOwnerLabel,
  financeCloseRefreshIdempotencyKey,
  financeCloseStatusCounts,
  financeCloseStatusLabel,
} from "./closeTabModel";
import { useCloseWorkpaperSection } from "./useCloseWorkpaperSection";

type CloseTabProps = {
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
  navigation?: PageSurfaceTabBarSpec;
  userId: number;
};

export default function CloseTab({
  canCreate,
  canUpdate,
  canApprove,
  defaultScope,
  lifecycleBlocks = [],
  navigation,
  userId,
}: CloseTabProps) {
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? ""));
  const [month, setMonth] = useState(String(defaultScope?.month ?? ""));
  const [workspace, setWorkspace] = useState<FinanceCloseWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedback = useFeedback();
  const scope = useMemo(() => closeScope(companyCode, year, month), [companyCode, month, year]);
  const [loadGate] = useState(createLatestRequestGate);
  const [mutationGate] = useState(createLatestRequestGate);
  const [contextTracker] = useState(() => createCurrentValueTracker(closeMutationContextKey(scope, null)));

  const load = useCallback(async (requestedScope: FinanceCloseScope | null) => {
    if (!requestedScope) {
      loadGate.invalidate();
      setWorkspace(null);
      setError(null);
      setLoading(false);
      return null;
    }
    const ticket = loadGate.begin(financeUiRequestScopeKey(requestedScope));
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyCode: requestedScope.companyCode,
        year: String(requestedScope.year),
        month: String(requestedScope.month),
      });
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/closing?${params.toString()}`), { signal: ticket.signal });
      const data = await response.json().catch(() => null) as FinanceCloseWorkspaceDto | ApiError | null;
      if (!response.ok) throw new Error(apiError(data, `关账工作区加载失败 (${response.status})`));
      const next = data as FinanceCloseWorkspaceDto;
      if (!financeUiResponseMatchesScope(next.scope, requestedScope)) throw new Error("关账工作区返回了不一致的公司或会计期间");
      if (!loadGate.isCurrent(ticket)) return null;
      contextTracker.set(closeMutationContextKey(requestedScope, next.run));
      setWorkspace(next);
      return next;
    } catch (caught) {
      if (!loadGate.isCurrent(ticket) || isAbortError(caught)) return null;
      contextTracker.set(closeMutationContextKey(requestedScope, null));
      setWorkspace(null);
      setError(caught instanceof Error ? caught.message : "关账工作区加载失败");
      return null;
    } finally {
      if (loadGate.isCurrent(ticket)) setLoading(false);
    }
  }, [contextTracker, loadGate]);

  useEffect(() => {
    void load(scope);
    return () => loadGate.invalidate();
  }, [load, loadGate, scope]);

  const invalidateScope = useCallback((nextScope: FinanceCloseScope | null) => {
    contextTracker.set(closeMutationContextKey(nextScope, null));
    loadGate.invalidate();
    mutationGate.invalidate();
    setWorkspace(null);
    setError(null);
    setLoading(false);
    setSaving(false);
  }, [contextTracker, loadGate, mutationGate]);

  useEffect(() => {
    const applyLocation = () => {
      const next = scopeFromLocation();
      invalidateScope(next);
      setCompanyCode(next?.companyCode ?? "");
      setYear(next ? String(next.year) : "");
      setMonth(next ? String(next.month) : "");
    };
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, [invalidateScope]);

  useEffect(() => {
    if (scope) writeCloseScopeLocation(scope);
  }, [scope]);

  const mutate = useCallback(async (kind: "open" | "refresh") => {
    if (!scope) return;
    const requestedScope = scope;
    const refresh = kind === "refresh" ? workspace?.run ?? null : null;
    const mutationContextKey = closeMutationContextKey(requestedScope, refresh);
    if (!contextTracker.isCurrent(mutationContextKey)) return;
    const ticket = mutationGate.begin(mutationContextKey);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(workspacePath(refresh
        ? "/api/modules/finance/ledger/closing/refresh"
        : "/api/modules/finance/ledger/closing"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refresh ? {
          runId: refresh.id,
          expectedVersion: refresh.version,
          idempotencyKey: financeCloseRefreshIdempotencyKey(refresh.id, refresh.version, userId),
        } : {
          ...requestedScope,
          idempotencyKey: financeCloseOpenIdempotencyKey(requestedScope, userId),
        }),
        signal: ticket.signal,
      });
      const data = await response.json().catch(() => null) as ApiError | null;
      if (!response.ok) throw new Error(apiError(data, `关账操作失败 (${response.status})`));
      if (!mutationGate.isCurrent(ticket)
        || !contextTracker.isCurrent(mutationContextKey)) return;
      await load(requestedScope);
      if (!mutationGate.isCurrent(ticket)) return;
      feedback.success(refresh ? "关账检查已刷新" : "关账运行已开启");
    } catch (caught) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : "关账操作失败";
      setError(message);
      feedback.error(message);
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }, [contextTracker, feedback, load, mutationGate, scope, userId, workspace]);

  const action = closeWriteAction(workspace, canCreate, canUpdate, saving, () => void mutate(workspace?.run ? "refresh" : "open"));
  const taskLabels = useMemo(() => new Map(workspace?.tasks.map((task) => [task.taskKey, task.label]) ?? []), [workspace?.tasks]);
  const workpaper = useCloseWorkpaperSection({
    scope,
    isPeriodClosed: workspace?.scope.isPeriodClosed ?? false,
    canUpdate,
    canApprove,
    actorUserId: userId,
    taskLabels,
    onChanged: async () => {
      if (workspace?.run && canUpdate && !workspace.scope.isPeriodClosed) await mutate("refresh");
      else await load(scope);
    },
  });
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter: companyCode,
    yearFilter: year,
    monthFilter: month,
    onCompanyChange: (value) => { invalidateScope(closeScope(value, year, month)); setCompanyCode(value); },
    onYearChange: (value) => { invalidateScope(closeScope(companyCode, value, month)); setYear(value); },
    onMonthChange: (value) => { invalidateScope(closeScope(companyCode, year, value)); setMonth(value); },
    showSearch: false,
    showPageSize: false,
    extraItems: [
      {
        kind: "action-group",
        key: "finance-close-read",
        actions: [{
          key: "reload",
          kind: "view",
          label: "重新读取",
          disabled: loading || saving || !scope,
          onClick: () => { void load(scope); },
        }],
      },
      ...(action ? [{ kind: "action-group" as const, key: "finance-close-write", actions: [action] }] : []),
      ...(workspace ? [{
        kind: "text" as const,
        key: "finance-close-state",
        content: workspace.scope.isPeriodClosed ? "期间已关闭" : workspace.run ? "检查已开启" : "尚未开启",
      }] : []),
    ],
  });

  const sections = closeSections({
    workspace, loading, error, lifecycleBlocks, canCreate, onOpenDeepLink,
    onSelectWorkpaper: workpaper.selectTask,
    workpaperSection: workpaper.section,
  });
  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody(sections)}
    />
  );
}

function closeSections({
  workspace,
  loading,
  error,
  lifecycleBlocks,
  canCreate,
  onOpenDeepLink,
  onSelectWorkpaper,
  workpaperSection,
}: {
  workspace: FinanceCloseWorkspaceDto | null;
  loading: boolean;
  error: string | null;
  lifecycleBlocks: BodySurfaceSectionSpec[];
  canCreate: boolean;
  onOpenDeepLink: (href: string) => void;
  onSelectWorkpaper: (taskKey: string) => void;
  workpaperSection: BodySurfaceSectionSpec | null;
}) {
  const sections: BodySurfaceSectionSpec[] = [
    ...lifecycleBlocks,
    ...(loading ? [createStatusSection("finance-close-loading", { kind: "loading", content: "正在读取关账检查" })] : []),
    ...(error ? [createStatusSection("finance-close-error", { kind: "error", content: error })] : []),
  ];
  if (!workspace) {
    if (!loading && !error) sections.push(createStatusSection("finance-close-scope-empty", { kind: "empty", content: "请选择公司和会计期间" }));
    return sections;
  }

  if (workspace.scope.isPeriodClosed) {
    sections.push(createMessageSection("finance-close-read-only", { tone: "warning", content: "当前会计期间已关闭，关账工作区只读。" }));
  } else if (!workspace.run) {
    sections.push(createMessageSection("finance-close-not-open", {
      tone: canCreate ? "muted" : "warning",
      content: canCreate ? "尚未开启关账运行；任务目录可先核对。" : "尚未开启关账运行，当前账号没有开启权限。",
    }));
  }

  const inventoryUnavailable = workspace.tasks.some((task) => task.ownerResourceKey === "inventory.operations" && task.status === "unavailable");
  if (inventoryUnavailable) {
    sections.push(createMessageSection("finance-close-inventory-unavailable", {
      tone: "warning",
      content: "存货关账检查当前不可用，仍属于未完成事项，不计入已就绪。",
    }));
  }

  const counts = financeCloseStatusCounts(workspace.statusCounts);
  sections.push(createMetricsSection("finance-close-metrics", {
    metrics: [
      { key: "total", label: "关账事项", value: `${counts.total} / ${FINANCE_CLOSE_TASK_COUNT}` },
      { key: "ready", label: "已就绪", value: counts.completed },
      { key: "pending", label: "待检查", value: counts.pending },
      { key: "blocked", label: "阻断", value: counts.blocked },
      { key: "unavailable", label: "不可用", value: counts.unavailable },
    ],
  }));
  const columns = closeColumns(onOpenDeepLink);
  sections.push(createPageTableSection("finance-close-tasks", {
    rows: [...workspace.tasks].sort((left, right) => left.sequence - right.sequence),
    columns,
    visibleColumns: columns.map((column) => column.key),
    rowKey: (task) => task.taskKey,
    rowState: (task) => closeRowState(task.status),
    rowActions: (task): DataSurfaceRowActionSpec[] => FINANCE_CLOSE_WORKPAPER_TASK_KEYS.some((key) => key === task.taskKey) ? [{
      key: "open-workpaper",
      kind: "edit",
      label: "查看底稿",
      onClick: () => onSelectWorkpaper(task.taskKey),
    }] : [],
    emptyText: "关账目录未返回任务",
    presentation: { density: "compact", cellWrap: "wrap" },
    mobile: { presentation: "landscape", title: "关账任务" },
    scroll: { x: true },
  }));
  if (workpaperSection) sections.push(workpaperSection);
  return sections;
}

function closeColumns(onOpenDeepLink: (href: string) => void): DataSurfaceColumnSpec<FinanceCloseTaskDto>[] {
  return [
    {
      key: "task",
      label: "事项",
      required: true,
      width: "lg",
      cell: (task) => ({ kind: "text", value: `${task.sequence}. ${task.label}`, emphasis: "medium" }),
    },
    {
      key: "status",
      label: "状态",
      required: true,
      width: "sm",
      cell: (task) => ({ kind: "badge", label: financeCloseStatusLabel(task.status), tone: closeStatusTone(task.status) }),
    },
    {
      key: "owner",
      label: "负责模块",
      required: true,
      width: "md",
      cell: (task) => financeCloseOwnerLabel(task.ownerResourceKey),
    },
    { key: "requiredEvidence", label: "必备证据", required: true, width: "xl", cell: (task) => task.requiredEvidence },
    { key: "blockers", label: "阻断项", required: true, width: "xl", cell: (task) => blockerCell(task, onOpenDeepLink) },
    { key: "evidenceRefs", label: "证据", required: true, width: "lg", cell: (task) => refsCell(financeCloseBusinessReferences(task.evidenceRefs), "暂无证据") },
    { key: "voucherRefs", label: "凭证", required: true, width: "lg", cell: (task) => refsCell(financeCloseBusinessReferences(task.voucherRefs), "暂无凭证") },
    {
      key: "inspectedAt",
      label: "检查时间",
      required: true,
      width: "md",
      cell: (task) => formatDateTime(task.inspectedAt),
    },
    { key: "deepLink", label: "处理入口", required: true, width: "lg", cell: (task) => deepLinkCell(task.deepLink, onOpenDeepLink) },
  ];
}

function blockerCell(task: FinanceCloseTaskDto, onOpenDeepLink: (href: string) => void): DataSurfaceCellSpec {
  if (task.blockers.length === 0) return { kind: "empty", content: "无" };
  return {
    kind: "group",
    direction: "column",
    items: task.blockers.flatMap((blocker) => [
      { kind: "text", value: financeCloseBusinessMessage(blocker.message), tone: "warning" },
      { kind: "action", action: { key: `blocker-${blocker.code}`, label: "打开处理入口", icon: "link", onClick: () => onOpenDeepLink(blocker.deepLink) } },
    ]),
  };
}

function refsCell(refs: string[], empty: string): DataSurfaceCellSpec {
  if (refs.length === 0) return { kind: "empty", content: empty };
  return { kind: "stack", items: refs.map((ref) => ({ kind: "text", value: ref, wrap: "wrap" })) };
}

function deepLinkCell(href: string, onOpenDeepLink: (href: string) => void): DataSurfaceCellSpec {
  return {
    kind: "action",
    action: { key: "open", label: "打开处理页", icon: "link", onClick: () => onOpenDeepLink(href) },
  };
}

function closeWriteAction(
  workspace: FinanceCloseWorkspaceDto | null,
  canCreate: boolean,
  canUpdate: boolean,
  saving: boolean,
  onClick: () => void,
) {
  if (!workspace || workspace.scope.isPeriodClosed) return null;
  if (!workspace.run && canCreate) return { key: "open", kind: "generate" as const, label: "开启关账", disabled: saving, onClick };
  if (workspace.run?.status === "open" && canUpdate) return { key: "refresh", kind: "refresh" as const, label: "刷新检查", disabled: saving, onClick };
  return null;
}

function closeScope(companyCode: string, year: string, month: string): FinanceCloseScope | null {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!companyCode.trim() || !Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2099 || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) return null;
  return { companyCode: companyCode.trim(), year: numericYear, month: numericMonth };
}

function closeMutationContextKey(
  scope: FinanceCloseScope | null,
  run: { id: number; version: number; status: string } | null,
) {
  if (!scope) return "";
  return `${financeUiRequestScopeKey(scope)}:${run ? `${run.id}:${run.version}:${run.status}` : "not-open"}`;
}

function scopeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return closeScope(params.get("companyCode") ?? "", params.get("year") ?? "", params.get("month") ?? "");
}

function writeCloseScopeLocation(scope: FinanceCloseScope) {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", "closing");
  params.set("companyCode", scope.companyCode);
  params.set("year", String(scope.year));
  params.set("month", String(scope.month));
  const next = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(null, "", next);
}

function onOpenDeepLink(href: string) {
  const target = new URL(workspacePath(href), window.location.origin);
  if (target.pathname === window.location.pathname) {
    window.history.pushState(null, "", `${target.pathname}${target.search}${target.hash}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.location.assign(`${target.pathname}${target.search}${target.hash}`);
}

function closeStatusTone(status: FinanceCloseTaskStatus) {
  if (status === "ready") return "green" as const;
  if (status === "blocked") return "red" as const;
  if (status === "unavailable") return "amber" as const;
  return "slate" as const;
}

function closeRowState(status: FinanceCloseTaskStatus) {
  if (status === "blocked") return "danger" as const;
  if (status === "unavailable") return "warning" as const;
  if (status === "pending") return "muted" as const;
  return "normal" as const;
}

function formatDateTime(value: string | null) {
  if (!value) return "尚未检查";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}

type ApiError = { error?: string; message?: string; issue?: { message?: string } };

function apiError(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = value as ApiError;
  return error.issue?.message || error.error || error.message || fallback;
}
