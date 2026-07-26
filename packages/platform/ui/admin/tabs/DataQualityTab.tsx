"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFieldsSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceProps,
  type DataSurfaceColumnSpec,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";
import { postJson, putJson, requestJson } from "../../api-client";
import {
  dataQualityNotificationRoutingItems,
  type DataQualityNotificationRouteDraft,
  type DataQualityNotificationRoutingOptions,
} from "./DataQualityNotificationRoutingFields";

type Severity = "critical" | "warning" | "info";
type DataQualityPolicy = {
  version: 2;
  schedule: { enabled: boolean; dailyAt: string; timeZone: string };
  mutationTrigger: { enabled: boolean };
  notifications: {
    minimumSeverity: Severity;
    repeatAfterHours: number;
    workspace: {
      enabled: boolean;
      fallbackRecipientUsernames: string[];
      routes: DataQualityNotificationRouteDraft[];
    };
    wecomGroup: { enabled: boolean };
  };
};
type CheckRow = {
  checkKey: string;
  domain: string;
  title: string;
  description: string;
  defaultSeverity: Severity;
  triggerModes: string[];
  lastStatus: string;
  lastFindingCount: number;
  lastEvaluatedAt: string | null;
};
type FindingRow = {
  id: number;
  fingerprint: string;
  domain: string;
  severity: Severity;
  title: string;
  summary: string;
  count: number;
  href: string | null;
  lastSeenAt: string;
  lastWorkspaceNotifiedAt: string | null;
  lastWecomNotifiedAt: string | null;
};
type RunRow = {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  checkCount: number;
  openFindingCount: number;
  newFindingCount: number;
  resolvedFindingCount: number;
  failureMessage: string | null;
};
type DeliveryRow = {
  id: number;
  runId: number;
  channel: string;
  destination: string;
  status: string;
  findingCount: number;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
};
type WorkbenchResponse = {
  policy: DataQualityPolicy;
  channelAvailability: { workspace: { configured: boolean }; wecomGroup: { configured: boolean } };
  routingOptions: DataQualityNotificationRoutingOptions;
  metrics: {
    checkCount: number;
    healthyCheckCount: number;
    issueCheckCount: number;
    errorCheckCount: number;
    openFindingCount: number;
    criticalFindingCount: number;
    pendingMutationCount: number;
  };
  checks: CheckRow[];
  findings: FindingRow[];
  runs: RunRow[];
  deliveries: DeliveryRow[];
};

type Props = {
  enabled: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
};

const statusLabel: Record<string, string> = {
  healthy: "正常",
  issue: "异常",
  error: "执行失败",
  never: "未运行",
  succeeded: "成功",
  partial: "部分成功",
  failed: "失败",
};
const triggerLabel: Record<string, string> = {
  manual: "手工",
  scheduled: "每日",
  mutation: "变更后",
};
const severityLabel: Record<Severity, string> = { critical: "严重", warning: "警告", info: "提示" };
const enabledChoiceSpec = {
  control: "choice" as const,
  valueType: "string" as const,
  options: {
    source: "static" as const,
    items: [
      { value: "开启", label: "开启" },
      { value: "关闭", label: "关闭" },
    ],
    visibleCount: 2,
  },
};

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

const checkColumns: DataSurfaceColumnSpec<CheckRow>[] = [
  { key: "domain", label: "领域", width: "xs", cell: (row) => ({ kind: "badge", label: row.domain.toUpperCase(), tone: row.domain === "platform" ? "slate" : "blue" }) },
  { key: "rule", label: "规则", width: "wide", wrap: "wrap", cell: (row) => ({ kind: "stack", items: [{ kind: "text", value: row.title, emphasis: "medium" }, { kind: "text", value: row.description, tone: "muted", wrap: "wrap" }], gap: "xs" }) },
  { key: "trigger", label: "触发", width: "md", cell: (row) => row.triggerModes.map((mode) => triggerLabel[mode] ?? mode).join(" · ") },
  { key: "status", label: "状态", width: "sm", cell: (row) => ({ kind: "badge", label: statusLabel[row.lastStatus] ?? row.lastStatus, tone: row.lastStatus === "healthy" ? "green" : row.lastStatus === "issue" ? "amber" : row.lastStatus === "error" ? "red" : "gray" }) },
  { key: "count", label: "影响", width: "xs", align: "right", cell: (row) => ({ kind: "number", value: row.lastFindingCount }) },
  { key: "evaluated", label: "最近巡检", width: "lg", cell: (row) => ({ kind: "text", value: dateTime(row.lastEvaluatedAt), tone: "muted", font: "mono" }) },
];

const findingColumns: DataSurfaceColumnSpec<FindingRow>[] = [
  { key: "severity", label: "级别", width: "xs", cell: (row) => ({ kind: "badge", label: severityLabel[row.severity], tone: row.severity === "critical" ? "red" : row.severity === "warning" ? "amber" : "blue" }) },
  { key: "domain", label: "领域", width: "xs", cell: (row) => row.domain.toUpperCase() },
  { key: "finding", label: "异常", width: "wide", wrap: "wrap", cell: (row) => ({ kind: "stack", items: [{ kind: "text", value: row.title, emphasis: "medium" }, { kind: "text", value: row.summary, tone: "muted", wrap: "wrap" }], gap: "xs" }) },
  { key: "count", label: "影响记录", width: "sm", align: "right", cell: (row) => ({ kind: "number", value: row.count }) },
  { key: "lastSeenAt", label: "最近发现", width: "lg", cell: (row) => ({ kind: "text", value: dateTime(row.lastSeenAt), font: "mono", tone: "muted" }) },
  { key: "open", label: "处理入口", width: "sm", cell: (row) => row.href ? ({ kind: "link", label: "打开来源", href: row.href }) : ({ kind: "empty", content: "-" }) },
];

const runColumns: DataSurfaceColumnSpec<RunRow>[] = [
  { key: "id", label: "批次", width: "xs", cell: (row) => ({ kind: "text", value: `#${row.id}`, font: "mono" }) },
  { key: "trigger", label: "触发", width: "sm", cell: (row) => triggerLabel[row.trigger] ?? row.trigger },
  { key: "status", label: "状态", width: "sm", cell: (row) => ({ kind: "badge", label: statusLabel[row.status] ?? row.status, tone: row.status === "succeeded" ? "green" : row.status === "partial" ? "amber" : "red" }) },
  { key: "checks", label: "规则", width: "xs", align: "right", cell: (row) => ({ kind: "number", value: row.checkCount }) },
  { key: "changes", label: "异常变化", width: "md", cell: (row) => `新增 ${row.newFindingCount} · 关闭 ${row.resolvedFindingCount}` },
  { key: "open", label: "未解决", width: "xs", align: "right", cell: (row) => ({ kind: "number", value: row.openFindingCount }) },
  { key: "startedAt", label: "开始时间", width: "lg", cell: (row) => ({ kind: "text", value: dateTime(row.startedAt), font: "mono", tone: "muted" }) },
];

const deliveryColumns: DataSurfaceColumnSpec<DeliveryRow>[] = [
  { key: "run", label: "批次", width: "xs", cell: (row) => ({ kind: "text", value: `#${row.runId}`, font: "mono" }) },
  { key: "channel", label: "通道", width: "sm", cell: (row) => row.channel === "workspace" ? "Workspace" : "企业微信群" },
  { key: "destination", label: "目的地", width: "lg", cell: (row) => ({ kind: "text", value: row.destination, font: "mono", tone: "muted" }) },
  { key: "status", label: "状态", width: "sm", cell: (row) => ({ kind: "badge", label: row.status === "sent" ? "已发送" : "失败", tone: row.status === "sent" ? "green" : "red" }) },
  { key: "findings", label: "异常规则", width: "sm", align: "right", cell: (row) => ({ kind: "number", value: row.findingCount }) },
  { key: "time", label: "投递时间", width: "lg", cell: (row) => ({ kind: "text", value: dateTime(row.sentAt ?? row.createdAt), font: "mono", tone: "muted" }) },
  { key: "error", label: "失败原因", width: "wide", wrap: "wrap", cell: (row) => row.error ? ({ kind: "text", value: row.error, tone: "danger", wrap: "wrap" }) : ({ kind: "empty", content: "-" }) },
];

export function useDataQualityTab({ enabled, showToast }: Props): {
  body: BodySurfaceProps;
  toolbarItems: SurfaceToolbarItem[];
} {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [draft, setDraft] = useState<DataQualityPolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<WorkbenchResponse>("/api/settings/admin/data-quality", { fallbackMessage: "加载数据质量工作台失败" });
      setData(next);
      setDraft(next.policy);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载数据质量工作台失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (enabled && !data && !loading) void load();
  }, [data, enabled, load, loading]);

  async function runNow() {
    setRunning(true);
    try {
      await postJson("/api/settings/admin/data-quality", { action: "run" }, "数据质量巡检失败");
      showToast("数据质量巡检已完成", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "数据质量巡检失败", "error");
    } finally {
      setRunning(false);
    }
  }

  async function testWecom() {
    setTesting(true);
    try {
      await postJson("/api/settings/admin/data-quality", { action: "test_wecom" }, "企微群机器人测试失败");
      showToast("企微群机器人测试消息已发送", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "企微群机器人测试失败", "error");
    } finally {
      setTesting(false);
    }
  }

  async function savePolicy() {
    if (!draft) return;
    setSaving(true);
    try {
      await putJson("/api/settings/admin/data-quality", {
        scheduleEnabled: draft.schedule.enabled,
        dailyAt: draft.schedule.dailyAt,
        mutationTriggerEnabled: draft.mutationTrigger.enabled,
        minimumSeverity: draft.notifications.minimumSeverity,
        repeatAfterHours: draft.notifications.repeatAfterHours,
        workspaceEnabled: draft.notifications.workspace.enabled,
        workspaceFallbackRecipientUsernames: draft.notifications.workspace.fallbackRecipientUsernames,
        workspaceRoutes: draft.notifications.workspace.routes.map((route) => ({
          id: route.id,
          resourceKey: route.resourceKey,
          departmentId: route.departmentId,
          recipientUsernames: route.recipientUsernames,
        })),
        wecomGroupEnabled: draft.notifications.wecomGroup.enabled,
      }, "保存数据质量策略失败");
      showToast("数据质量设置已保存", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存数据质量策略失败", "error");
    } finally {
      setSaving(false);
    }
  }

  const dirty = Boolean(data && draft && JSON.stringify(data.policy) !== JSON.stringify(draft));
  const toolbarItems: SurfaceToolbarItem[] = [
    { kind: "icon-button", key: "run-data-quality", icon: "refresh", label: running ? "巡检中..." : "立即巡检", variant: "primary", disabled: running || loading, onClick: () => void runNow() },
    { kind: "icon-button", key: "test-data-quality-wecom", icon: "send", label: testing ? "发送中..." : "测试企微群", disabled: testing || !data?.channelAvailability.wecomGroup.configured, onClick: () => void testWecom() },
  ];

  const body: BodySurfaceProps = (() => {
    if (!data || !draft) return createPageBody([createStatusSection("data-quality-loading", { kind: loading ? "loading" : "error", content: loading ? "正在加载数据质量工作台..." : "数据质量工作台加载失败" })]);
    const config = {
      ...createFieldsSection("data-quality-policy", [
        { kind: "groupTitle" as const, key: "trigger-title", title: "触发条件" },
        { key: "schedule-enabled", label: "每日巡检", spec: enabledChoiceSpec, value: draft.schedule.enabled ? "开启" : "关闭", onChange: (value: unknown) => setDraft({ ...draft, schedule: { ...draft.schedule, enabled: value === "开启" } }) },
        { key: "daily-at", label: "执行时间", spec: { control: "temporal" as const, valueType: "time" as const, precision: "time" as const }, value: draft.schedule.dailyAt, disabled: !draft.schedule.enabled, onChange: (value: unknown) => setDraft({ ...draft, schedule: { ...draft.schedule, dailyAt: String(value ?? "") } }) },
        { key: "time-zone", kind: "readonly" as const, label: "业务时区", value: draft.schedule.timeZone, fontRole: "mono" as const },
        { key: "mutation-enabled", label: "变更后复检", spec: enabledChoiceSpec, value: draft.mutationTrigger.enabled ? "开启" : "关闭", onChange: (value: unknown) => setDraft({ ...draft, mutationTrigger: { enabled: value === "开启" } }) },
        { kind: "groupTitle" as const, key: "notification-title", title: "异常提醒" },
        { key: "minimum-severity", label: "最低提醒级别", spec: { control: "choice" as const, valueType: "string" as const, options: { source: "static" as const, items: [{ value: "critical", label: "仅严重" }, { value: "warning", label: "警告及以上" }, { value: "info", label: "全部异常" }] } }, value: draft.notifications.minimumSeverity, onChange: (value: unknown) => setDraft({ ...draft, notifications: { ...draft.notifications, minimumSeverity: String(value) as Severity } }) },
        { key: "repeat-hours", label: "重复提醒间隔（小时）", spec: { control: "number" as const, valueType: "number" as const, validation: { min: 1, max: 720 } }, value: draft.notifications.repeatAfterHours, onChange: (value: unknown) => setDraft({ ...draft, notifications: { ...draft.notifications, repeatAfterHours: Number(value) } }) },
        { key: "workspace-enabled", label: "站内提醒", spec: enabledChoiceSpec, value: draft.notifications.workspace.enabled ? "开启" : "关闭", onChange: (value: unknown) => setDraft({ ...draft, notifications: { ...draft.notifications, workspace: { ...draft.notifications.workspace, enabled: value === "开启" } } }) },
        ...dataQualityNotificationRoutingItems({
          workspace: draft.notifications.workspace,
          options: data.routingOptions,
          wecomGroupField: {
            key: "wecom-enabled",
            label: "企业微信群提醒",
            spec: { ...enabledChoiceSpec, state: data.channelAvailability.wecomGroup.configured ? "normal" as const : "disabled" as const },
            value: draft.notifications.wecomGroup.enabled ? "开启" : "关闭",
            onChange: (value: unknown) => setDraft({ ...draft, notifications: { ...draft.notifications, wecomGroup: { enabled: value === "开启" } } }),
            hint: data.channelAvailability.wecomGroup.configured ? undefined : "未配置群机器人",
          },
          onChange: (workspace) => setDraft({ ...draft, notifications: { ...draft.notifications, workspace } }),
        }),
      ], { layout: { columns: 3 } }),
      header: {
        title: "触发与通知",
        actions: [{ key: "save-data-quality-policy", label: saving ? "保存中..." : "保存", icon: "save" as const, variant: "primary" as const, disabled: saving || !dirty, onClick: () => void savePolicy() }],
      },
    };
    return createPageBody([
      createMetricsSection("data-quality-metrics", { metrics: [
        { key: "checks", label: "已接入规则", value: data.metrics.checkCount },
        { key: "healthy", label: "正常规则", value: data.metrics.healthyCheckCount },
        { key: "issues", label: "异常规则", value: data.metrics.issueCheckCount },
        { key: "critical", label: "严重异常", value: data.metrics.criticalFindingCount },
        { key: "open", label: "未解决异常", value: data.metrics.openFindingCount },
        { key: "pending", label: "待合并复检", value: data.metrics.pendingMutationCount },
      ] }),
      ...(data.metrics.errorCheckCount > 0
        ? [createMessageSection("data-quality-provider-error", { tone: "danger", content: `有 ${data.metrics.errorCheckCount} 个规则执行失败` })]
        : []),
      config,
      {
        ...createPageTableSection("data-quality-findings", { rows: data.findings, columns: findingColumns, visibleColumns: findingColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "当前没有未解决的数据质量异常", presentation: { density: "compact", cellWrap: "wrap" }, scroll: { x: true } }),
        header: { title: "未解决异常", badges: [{ key: "open", label: `${data.findings.length} 项`, tone: data.findings.length > 0 ? "warning" as const : "success" as const }] },
      },
      { ...createPageTableSection("data-quality-checks", { rows: data.checks, columns: checkColumns, visibleColumns: checkColumns.map((column) => column.key), rowKey: (row) => row.checkKey, emptyText: "尚未执行首次巡检", presentation: { density: "compact", cellWrap: "wrap" }, scroll: { x: true } }), header: { title: "规则运行状态" } },
      { ...createPageTableSection("data-quality-runs", { rows: data.runs, columns: runColumns, visibleColumns: runColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无巡检批次", presentation: { density: "compact" }, scroll: { x: true } }), header: { title: "最近巡检批次" } },
      { ...createPageTableSection("data-quality-deliveries", { rows: data.deliveries, columns: deliveryColumns, visibleColumns: deliveryColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无异常提醒投递", presentation: { density: "compact", cellWrap: "wrap" }, scroll: { x: true } }), header: { title: "最近通知投递" } },
    ]);
  })();

  return { body, toolbarItems };
}
