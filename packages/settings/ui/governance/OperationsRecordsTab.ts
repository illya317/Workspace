"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  createFieldsSection,
  createListSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPanelSection,
  createStatusSection,
  type BodySurfaceProps,
  type FormSurfaceReadOnlyFieldSpec,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";
import { useEffect, useState } from "react";

import type {
  OperationsRecord,
  OperationsRecordsResponse,
} from "../../operations-records-contract";

interface UseOperationsRecordsTabInput {
  enabled: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
}

const SOURCE_LABEL: Record<string, string> = {
  all: "全部来源",
  "sql-settings": "SQL 设置",
  "relation-policy": "关系策略",
};

const STATUS_VIEW: Record<string, {
  label: string;
  tone: "muted" | "info" | "success" | "warning" | "danger";
  messageTone: "default" | "muted" | "success" | "warning" | "danger";
}> = {
  all: { label: "全部状态", tone: "muted", messageTone: "muted" },
  pending: { label: "等待执行", tone: "warning", messageTone: "warning" },
  running: { label: "执行中", tone: "info", messageTone: "default" },
  succeeded: { label: "已完成", tone: "success", messageTone: "success" },
  failed: { label: "失败", tone: "danger", messageTone: "danger" },
  attention: { label: "待核对", tone: "warning", messageTone: "warning" },
};

const EMPTY_RESPONSE: OperationsRecordsResponse = {
  records: [],
  page: 0,
  pageSize: 50,
  total: 0,
  totalPages: 1,
  generatedAt: "",
  coverage: { windowDays: 180, providers: [] },
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function responseError(response: Response) {
  return response.json()
    .then((payload) => (payload as { error?: string }).error || `加载运维记录失败 (${response.status})`)
    .catch(() => `加载运维记录失败 (${response.status})`);
}

export function useOperationsRecordsTab({ enabled, showToast }: UseOperationsRecordsTabInput) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [data, setData] = useState<OperationsRecordsResponse>(EMPTY_RESPONSE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      source,
      status,
    });
    if (query.trim()) params.set("query", query.trim());
    setLoading(true);
    setLoadFailed(false);
    fetch(workspacePath(`/api/modules/settings/governance/operations?${params.toString()}`), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return response.json() as Promise<OperationsRecordsResponse>;
      })
      .then((payload) => {
        setData(payload);
        setSelectedId((current) => payload.records.some((record) => record.id === current)
          ? current
          : payload.records[0]?.id ?? null);
        if (payload.page !== page) setPage(payload.page);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadFailed(true);
        setData((current) => ({ ...current, records: [], total: 0, totalPages: 1 }));
        setSelectedId(null);
        showToast(error instanceof Error ? error.message : "加载运维记录失败", "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, page, pageSize, query, showToast, source, status]);

  const selectedRecord = data.records.find((record) => record.id === selectedId) ?? null;

  const resetListPosition = () => {
    setPage(0);
    setMobileDetailActive(false);
  };

  const toolbarItems: SurfaceToolbarItem[] = [
    {
      kind: "search",
      key: "operations-records-search",
      value: query,
      onChange: (value) => { setQuery(value); resetListPosition(); },
      placeholder: "搜索操作、对象或操作人",
      ariaLabel: "搜索运维记录",
    },
    {
      kind: "option-group",
      key: "operations-records-source",
      label: "来源",
      value: source,
      options: ["all", "sql-settings", "relation-policy"].map((value) => ({ value, label: SOURCE_LABEL[value] })),
      onChange: (value) => { setSource(value); resetListPosition(); },
      ariaLabel: "筛选记录来源",
      presentation: "accordion",
    },
    {
      kind: "option-group",
      key: "operations-records-status",
      label: "状态",
      value: status,
      options: ["all", "pending", "running", "succeeded", "failed", "attention"].map((value) => ({ value, label: STATUS_VIEW[value]?.label ?? value })),
      onChange: (value) => { setStatus(value); resetListPosition(); },
      ariaLabel: "筛选记录状态",
      presentation: "accordion",
    },
    {
      kind: "page-size",
      key: "operations-records-page-size",
      label: "分页",
      value: String(pageSize),
      options: [20, 50, 100].map((value) => ({ value: String(value), label: String(value) + "条/页" })),
      onChange: (value) => { setPageSize(Number(value)); resetListPosition(); },
    },
  ];

  let body: BodySurfaceProps;
  if (loading && data.records.length === 0) {
    body = createPageBody([createStatusSection("operations-records-loading", { kind: "loading", content: "正在读取运维记录" })]);
  } else if (loadFailed) {
    body = createPageBody([createStatusSection("operations-records-error", { kind: "empty", content: "运维记录读取失败" })]);
  } else if (data.records.length === 0) {
    body = createPageBody([createStatusSection("operations-records-empty", { kind: "empty", content: "当前筛选范围暂无运维记录" })]);
  } else {
    const list = createListSection("operations-records-list", {
      presentation: "list",
      density: "compact",
      empty: { content: "暂无运维记录", compact: true },
      items: data.records.map((record) => {
        const statusView = STATUS_VIEW[record.status];
        return {
          key: record.id,
          title: record.sourceLabel + " · " + record.actionLabel,
          description: record.target,
          meta: formatDateTime(record.occurredAt) + " · " + record.actorLabel,
          badges: [{ key: "status", label: statusView.label, tone: statusView.tone }],
          tone: record.id === selectedId ? "info" as const : "default" as const,
          onClick: () => {
            setSelectedId(record.id);
            setMobileDetailActive(true);
          },
        };
      }),
    });

    const detail = selectedRecord
      ? createPageBody([
          createPanelSection("operations-record-detail", {
            title: selectedRecord.sourceLabel + " · " + selectedRecord.actionLabel,
            sections: [
              createMessageSection("operations-record-status", {
                tone: STATUS_VIEW[selectedRecord.status].messageTone,
                content: STATUS_VIEW[selectedRecord.status].label + (selectedRecord.completedAt
                  ? " · 完成于 " + formatDateTime(selectedRecord.completedAt)
                  : ""),
              }),
              createFieldsSection("operations-record-fields", operationRecordFields(selectedRecord), {
                kind: "detail",
                layout: { columns: 2, density: "compact" },
              }),
              createMessageSection("operations-record-reason", {
                tone: "muted",
                content: selectedRecord.reason || "未填写原因",
              }),
              ...(selectedRecord.result ? [createMessageSection("operations-record-result", {
                tone: selectedRecord.status === "failed" || selectedRecord.status === "attention" ? "danger" : "muted",
                content: selectedRecord.result,
              })] : []),
            ],
          }),
        ])
      : createPageBody([createStatusSection("operations-record-detail-empty", { kind: "empty", content: "请选择左侧运维记录" })]);

    body = createMasterDetailBody({
      master: {
        label: "运维记录",
        body: createPageBody([list]),
        presentation: "compact",
        footer: data.total > pageSize
          ? { pagination: { page: data.page, totalPages: data.totalPages, total: data.total, onPageChange: (nextPage) => { setPage(nextPage); setMobileDetailActive(false); } } }
          : undefined,
      },
      detail,
      desktop: { ratio: [3, 7] },
      mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
    });
  }

  return { body, footer: undefined, toolbarItems };
}

function operationRecordFields(record: OperationsRecord): FormSurfaceReadOnlyFieldSpec[] {
  return [
    { kind: "readonly", key: "source", label: "来源", value: record.sourceLabel },
    { kind: "readonly", key: "action", label: "操作", value: record.actionLabel },
    { kind: "readonly", key: "target", label: "对象", value: record.target, fontRole: "mono", title: record.target },
    { kind: "readonly", key: "actor", label: "操作人", value: record.actorLabel },
    { kind: "readonly", key: "occurred-at", label: "发生时间", value: formatDateTime(record.occurredAt), fontRole: "mono" },
    { kind: "readonly", key: "completed-at", label: "完成时间", value: record.completedAt ? formatDateTime(record.completedAt) : "尚未完成", fontRole: "mono" },
    { kind: "readonly", key: "provenance", label: "数据来源说明", value: record.provenance, span: "wide", fontRole: "mono", title: record.provenance },
  ];
}
