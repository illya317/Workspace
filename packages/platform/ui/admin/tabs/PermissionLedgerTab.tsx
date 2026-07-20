"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useMemo, useState } from "react";
import {
  createPageBody,
  createPageTableSection,
  type BodySurfaceProps,
  type DataSurfaceColumnSpec,
  type PageSurfaceFooterSpec,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";

type LedgerEventType = "grant" | "revoke" | "baseline";
type LedgerSubjectType = "user" | "position" | "department";

interface PermissionGrantLedgerEvent {
  id: number;
  eventType: LedgerEventType;
  actorLabel: string | null;
  subjectType: LedgerSubjectType;
  subjectId: number;
  subjectLabel: string | null;
  resourceKey: string;
  resourceName: string | null;
  actionKey: string;
  scopeId: string | null;
  beforeValue: boolean;
  afterValue: boolean;
  source: string;
  reason: string | null;
  batchId: string | null;
  createdAt: string;
}

interface LedgerResponse {
  events: PermissionGrantLedgerEvent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface UsePermissionLedgerTabInput {
  enabled: boolean;
  showToast: (msg: string, type?: "success" | "error") => void;
}

const EVENT_LABEL: Record<string, string> = {
  all: "全部",
  grant: "授予",
  revoke: "取消",
  baseline: "基线",
};

const SUBJECT_LABEL: Record<string, string> = {
  all: "全部对象",
  user: "员工",
  position: "岗位",
  department: "部门",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function sourceLabel(source: string) {
  if (source === "permission_request") return "后台授权";
  if (source === "baseline_script") return "基线补录";
  if (source === "system") return "系统同步";
  return source;
}

function subjectFallback(row: PermissionGrantLedgerEvent) {
  return `${SUBJECT_LABEL[row.subjectType] ?? row.subjectType}#${row.subjectId}`;
}

function operationTone(eventType: string): "green" | "red" | "slate" {
  if (eventType === "grant") return "green";
  if (eventType === "revoke") return "red";
  return "slate";
}

export function usePermissionLedgerTab({ enabled, showToast }: UsePermissionLedgerTabInput) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [subjectType, setSubjectType] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState<LedgerResponse>({ events: [], page: 0, pageSize: 50, total: 0, totalPages: 1 });
  const columns = useMemo<DataSurfaceColumnSpec<PermissionGrantLedgerEvent>[]>(() => [
    {
      key: "createdAt",
      label: "时间",
      width: "lg",
      cell: (row) => ({ kind: "text", value: formatDateTime(row.createdAt), font: "mono", tone: "muted" }),
    },
    {
      key: "eventType",
      label: "动作",
      width: "sm",
      cell: (row) => ({ kind: "badge", label: EVENT_LABEL[row.eventType] ?? row.eventType, tone: operationTone(row.eventType) }),
    },
    { key: "actor", label: "操作人", width: "md", cell: (row) => row.actorLabel || "系统" },
    {
      key: "subject",
      label: "授权对象",
      width: "lg",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: row.subjectLabel || subjectFallback(row), emphasis: "medium" },
          { kind: "text", value: `${SUBJECT_LABEL[row.subjectType] ?? row.subjectType} · ${row.subjectId}`, font: "mono", tone: "muted" },
        ],
      }),
    },
    {
      key: "resource",
      label: "资源",
      width: "wide",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: row.resourceName || row.resourceKey, emphasis: "medium" },
          { kind: "text", value: row.resourceKey, font: "mono", tone: "muted" },
        ],
      }),
    },
    {
      key: "actionKey",
      label: "权限",
      width: "sm",
      cell: (row) => ({ kind: "text", value: row.actionKey, font: "mono" }),
    },
    {
      key: "scopeId",
      label: "范围",
      width: "lg",
      cell: (row) => row.scopeId
        ? { kind: "text", value: row.scopeId, font: "mono", tone: "muted" }
        : { kind: "empty", content: "全局" },
    },
    { key: "source", label: "来源", width: "md", cell: (row) => sourceLabel(row.source) },
  ], []);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    async function load() {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (query.trim()) params.set("query", query.trim());
      if (eventType !== "all") params.set("eventType", eventType);
      if (subjectType !== "all") params.set("subjectType", subjectType);
      try {
        const res = await fetch(workspacePath(`/api/settings/admin/permission-grant-ledger?${params.toString()}`), { signal: controller.signal });
        if (!res.ok) {
          showToast("加载权限台账失败: " + res.status, "error");
          return;
        }
        setData(await res.json() as LedgerResponse);
      } catch {
        if (!controller.signal.aborted) showToast("加载权限台账失败", "error");
      }
    }
    load();
    return () => controller.abort();
  }, [enabled, eventType, page, pageSize, query, showToast, subjectType]);

  const toolbarItems: SurfaceToolbarItem[] = [
    {
      kind: "search",
      key: "ledger-search",
      value: query,
      onChange: (value) => {
        setQuery(value);
        setPage(0);
      },
      placeholder: "搜索记录",
      ariaLabel: "搜索权限台账",
    },
    {
      kind: "option-group",
      key: "ledger-event-type",
      label: "操作",
      value: eventType,
      options: ["all", "grant", "revoke", "baseline"].map((value) => ({ value, label: EVENT_LABEL[value] })),
      onChange: (value) => {
        setEventType(value);
        setPage(0);
      },
      ariaLabel: "筛选操作",
      presentation: "accordion",
    },
    {
      kind: "option-group",
      key: "ledger-subject-type",
      label: "对象",
      value: subjectType,
      options: ["all", "user", "position", "department"].map((value) => ({ value, label: SUBJECT_LABEL[value] })),
      onChange: (value) => {
        setSubjectType(value);
        setPage(0);
      },
      ariaLabel: "筛选授权对象",
      presentation: "accordion",
    },
    {
      kind: "page-size",
      key: "ledger-page-size",
      label: "分页",
      value: String(pageSize),
      options: [20, 50, 100].map((value) => ({ value: String(value), label: `${value}条/页` })),
      onChange: (value) => {
        setPageSize(Number(value));
        setPage(0);
      },
    },
  ];

  const body: BodySurfaceProps = createPageBody(data.events.length > 0 ? [
    createPageTableSection("permission-grant-ledger", {
      rows: data.events,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => String(row.id),
      emptyText: "暂无权限台账记录",
      presentation: { density: "compact", cellWrap: "nowrap" },
    }),
  ] : []);

  const footer: PageSurfaceFooterSpec | undefined = data.total > pageSize
    ? {
        pagination: {
          page,
          totalPages: data.totalPages,
          total: data.total,
          onPageChange: setPage,
        },
      }
    : undefined;

  return { body, footer, toolbarItems };
}
