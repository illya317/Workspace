"use client";

import { useState } from "react";
import {
  createEmptySection,
  createListSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTabBar,
  createSectionSection,
  PageSurface,
  type BodySurfaceBadgeSpec,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import type {
  AgentManagementRuntimeKind,
  AgentReportsData,
  AgentReportStatus,
  AgentRunReportItem,
} from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";

type Props = { data: AgentReportsData };

const RUNTIME_LABELS: Record<AgentManagementRuntimeKind, string> = {
  workspace: "Workspace",
  codex_local: "本地 Codex",
  ci: "CI",
  server_ops: "服务器运维",
};

const STATUS_VIEW: Record<AgentReportStatus, { label: string; tone: BodySurfaceBadgeSpec["tone"] }> = {
  running: { label: "运行中", tone: "info" },
  completed: { label: "已完成", tone: "success" },
  awaiting_confirmation: { label: "待确认", tone: "warning" },
  awaiting_input: { label: "待补充", tone: "warning" },
  failed: { label: "失败", tone: "danger" },
  aborted: { label: "已中止", tone: "warning" },
};

function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "暂无运行";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function overviewSections(data: AgentReportsData): BodySurfaceSectionSpec[] {
  const external = data.externalReceipts.length > 0
    ? createListSection("agent-report-external-list", {
        presentation: "list",
        items: data.externalReceipts.map((binding) => ({
          key: binding.key,
          title: `${binding.agentName} · ${RUNTIME_LABELS[binding.runtimeKind]}`,
          description: binding.roleName,
          trailing: binding.bindingStatus === "active" ? "配置已启用" : "配置已停用",
          badges: [{ key: "receipt", label: "任务回执未接入", tone: "warning" }],
        })),
      })
    : createEmptySection("agent-report-external-empty", { content: "暂无外部运行时绑定。" });

  return [
    createMetricsSection("agent-report-overview-metrics", {
      metrics: [
        { key: "sessions", label: "Workspace 工作会话", value: formatCount(data.metrics.sessionCount) },
        { key: "running", label: "运行中", value: formatCount(data.metrics.runningCount) },
        { key: "completed", label: "已完成", value: formatCount(data.metrics.completedCount) },
        { key: "confirmation", label: "待确认", value: formatCount(data.metrics.awaitingConfirmationCount) },
        { key: "input", label: "待补充", value: formatCount(data.metrics.awaitingInputCount) },
        { key: "exceptions", label: "异常 / 中止", value: formatCount(data.metrics.exceptionCount) },
      ],
    }),
    createMessageSection("agent-report-truth-boundary", {
      content: "当前任务汇报以 Workspace 会话聚合运行轮次；它是运行审计投影，不把单次模型调用冒充独立业务任务。Codex、CI 和服务器任务需要外部回执后才会进入汇报。",
      tone: "muted",
    }),
    createSectionSection("agent-report-external", {
      title: `外部运行时 · ${data.metrics.externalBindingCount} 个绑定`,
      sections: [external],
    }),
  ];
}

function agentSections(data: AgentReportsData): BodySurfaceSectionSpec[] {
  const list = data.profiles.length > 0
    ? createListSection("agent-report-profiles-list", {
        presentation: "cards",
        items: data.profiles.map((profile) => ({
          key: profile.key,
          title: `${profile.agentName} · ${profile.roleName}`,
          description: profile.runtimeKinds.length > 0
            ? profile.runtimeKinds.map((kind) => RUNTIME_LABELS[kind]).join(" · ")
            : "未绑定运行时",
          trailing: `最近运行 ${formatDateTime(profile.lastRunAt)}`,
          badges: [
            { key: "sessions", label: `${profile.sessionCount} 会话`, tone: "info" },
            { key: "runs", label: `${profile.runCount} 轮`, tone: "muted" },
            { key: "completed", label: `${profile.completedCount} 完成`, tone: "success" },
            { key: "confirmation", label: `${profile.awaitingConfirmationCount} 待确认`, tone: profile.awaitingConfirmationCount > 0 ? "warning" : "muted" },
            { key: "exceptions", label: `${profile.exceptionCount} 异常`, tone: profile.exceptionCount > 0 ? "danger" : "muted" },
            ...(profile.unreportedRuntimeCount > 0
              ? [{ key: "unreported", label: `${profile.unreportedRuntimeCount} 外部回执未接入`, tone: "warning" as const }]
              : []),
          ],
        })),
      })
    : createEmptySection("agent-report-profiles-empty", { content: "暂无 Agent 档案。" });
  return [createSectionSection("agent-report-profiles", { title: data.period.label, sections: [list] })];
}

function reportList(key: string, reports: AgentRunReportItem[]) {
  if (reports.length === 0) return createEmptySection(`${key}-empty`, { content: "没有匹配的 Workspace 运行汇报。" });
  return createListSection(key, {
    presentation: "list",
    items: reports.map((report) => {
      const status = STATUS_VIEW[report.status];
      const latestRunStatus = STATUS_VIEW[report.latestRunStatus];
      const latestRunIsException = report.latestRunStatus === "failed" || report.latestRunStatus === "aborted";
      const description = report.latestErrorMessage
        || report.summaryShort
        || report.latestToolKey
        || report.contextLabel
        || report.pagePath
        || "本会话没有可展示的摘要或工具结果。";
      return {
        key: report.sessionId,
        title: report.title,
        description,
        meta: `${report.employeeName} · ${report.agentName} · ${RUNTIME_LABELS[report.runtimeKind]} · ${formatDateTime(report.lastRunAt)}`,
        trailing: `${report.runCount} 个运行轮次`,
        tone: report.latestRunStatus === "failed"
          ? "danger"
          : report.latestRunStatus === "aborted" || report.status === "aborted"
            ? "warning"
            : "default",
        badges: [
          { key: "status", label: status.label, tone: status.tone },
          ...(latestRunIsException && report.latestRunStatus !== report.status
            ? [{ key: "latest-run", label: `最近运行${latestRunStatus.label}`, tone: latestRunStatus.tone }]
            : []),
          ...(report.latestResultType ? [{ key: "result", label: report.latestResultType, tone: "muted" as const }] : []),
          ...(report.proposalCount > 0 ? [{ key: "proposals", label: `${report.proposalCount} 个提案`, tone: "warning" as const }] : []),
        ],
      };
    }),
  });
}

function runSections(data: AgentReportsData, exceptionsOnly: boolean): BodySurfaceSectionSpec[] {
  if (!data.canAudit) {
    return [createMessageSection("agent-report-audit-required", {
      content: "运行标题、员工、结果和错误信息需要 agent.reports.audit 权限；当前仅展示 Agent 级汇总。",
      tone: "warning",
    })];
  }
  const reports = exceptionsOnly
    ? data.reports.filter((report) => report.latestRunStatus === "failed" || report.latestRunStatus === "aborted")
    : data.reports;
  return [
    createSectionSection(exceptionsOnly ? "agent-report-exceptions" : "agent-report-runs", {
      title: exceptionsOnly ? "异常与中止" : `最近 ${reports.length} 个 Workspace 会话`,
      sections: [reportList(exceptionsOnly ? "agent-report-exception-list" : "agent-report-run-list", reports)],
    }),
    createMessageSection("agent-report-detail-note", {
      content: "汇报只读取数据库中的会话标题、压缩摘要、最终工具、结果类型和错误审计；不会加载原始聊天 transcript。",
      tone: "muted",
    }),
  ];
}

export function AgentReportsClient({ data }: Props) {
  const tabs = getPageViewTabs("/agent/reports");
  const [active, setActive] = useState(tabs[0]?.key ?? "overview");
  const sections = active === "agents"
    ? agentSections(data)
    : active === "runs"
      ? runSections(data, false)
      : active === "exceptions"
        ? runSections(data, true)
        : overviewSections(data);

  return (
    <PageSurface
      kind="standard"
      tabbar={createPageTabBar({ items: tabs, active, onChange: setActive, ariaLabel: "Agent 任务汇报视图" })}
      body={createPageBody(sections)}
    />
  );
}
