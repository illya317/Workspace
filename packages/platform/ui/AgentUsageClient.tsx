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
import type { AgentReportStatus, AgentUsageData } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";

type Props = { data: AgentUsageData };

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
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function tokenTotal(values: {
  inputOtherTokens: number;
  inputCacheReadTokens: number;
  inputCacheCreationTokens: number;
  outputTokens: number;
}) {
  return values.inputOtherTokens + values.inputCacheReadTokens + values.inputCacheCreationTokens + values.outputTokens;
}

function formatContextUsage(value: number | null) {
  return value == null ? "未采集" : `${(value * 100).toFixed(1)}%`;
}

function formatCapturedTokenCount(value: number, capturedRunCount: number) {
  return capturedRunCount > 0 ? formatCount(value) : "未采集";
}

function overviewSections(data: AgentUsageData): BodySurfaceSectionSpec[] {
  const total = tokenTotal(data.metrics);
  return [
    createMetricsSection("agent-usage-overview-metrics", {
      metrics: [
        { key: "employees", label: "使用员工", value: formatCount(data.metrics.employeeCount) },
        { key: "sessions", label: "会话", value: formatCount(data.metrics.sessionCount) },
        { key: "runs", label: "运行轮次", value: formatCount(data.metrics.runCount) },
        { key: "completed", label: "运行成功", value: formatCount(data.metrics.succeededCount) },
        { key: "exceptions", label: "失败 / 中止", value: formatCount(data.metrics.failedCount + data.metrics.abortedCount) },
        {
          key: "tokens",
          label: "已采集 Token",
          value: data.metrics.tokenCapturedRunCount > 0 ? formatCount(total) : "未采集",
        },
      ],
    }),
    createSectionSection("agent-usage-overview-status", {
      title: data.period.label,
      sections: [createListSection("agent-usage-overview-status-list", {
        presentation: "cards",
        items: [
          {
            key: "running",
            title: "当前运行",
            description: `${formatCount(data.metrics.runningCount)} 个模型轮次仍在处理。`,
            badges: [{ key: "running", label: formatCount(data.metrics.runningCount), tone: data.metrics.runningCount > 0 ? "info" : "muted" }],
          },
          {
            key: "coverage",
            title: "Token 采集覆盖",
            description: `${formatCount(data.metrics.tokenCapturedRunCount)} / ${formatCount(data.metrics.runCount)} 个运行轮次有真实 SDK 用量。`,
            badges: [{
              key: "coverage",
              label: data.metrics.runCount > 0 ? `${Math.round(data.metrics.tokenCapturedRunCount / data.metrics.runCount * 100)}%` : "暂无运行",
              tone: data.metrics.tokenCapturedRunCount === data.metrics.runCount && data.metrics.runCount > 0 ? "success" : "warning",
            }],
          },
          {
            key: "context",
            title: "上下文占用峰值",
            description: "来自 Kimi SDK 的 context_usage 原始比例，不换算成 Token。",
            badges: [{ key: "context", label: formatContextUsage(data.metrics.contextUsagePeak), tone: "muted" }],
          },
        ],
      })],
    }),
    createMessageSection("agent-usage-facts", {
      content: "统计基于 AgentSession 与 AgentRun；运行成功仅表示模型轮次正常结束，不代表提案已确认或业务变更已完成。原始对话不会复制到分析库。",
      tone: "muted",
    }),
  ];
}

function employeeSections(data: AgentUsageData): BodySurfaceSectionSpec[] {
  if (!data.canAudit) {
    return [createMessageSection("agent-usage-audit-required", {
      content: "员工姓名、部门和会话明细需要 agent.usage.audit 权限；当前仅展示去身份化汇总。",
      tone: "warning",
    })];
  }
  const list = data.employees.length > 0
    ? createListSection("agent-usage-employees-list", {
        presentation: "list",
        items: data.employees.map((employee) => ({
          key: employee.userId,
          title: employee.employeeId ? `${employee.employeeName} · ${employee.employeeId}` : employee.employeeName,
          description: employee.departmentName || "未绑定当前部门",
          meta: `最近使用 ${formatDateTime(employee.lastUsedAt)}`,
          trailing: employee.capturedRunCount === 0 || employee.totalTokens == null
            ? "Token 未采集"
            : `已采集 ${formatCount(employee.totalTokens)} Token · ${employee.capturedRunCount}/${employee.runCount} 轮`,
          badges: [
            { key: "sessions", label: `${employee.sessionCount} 会话`, tone: "info" },
            { key: "runs", label: `${employee.runCount} 轮`, tone: "muted" },
            { key: "succeeded", label: `${employee.succeededCount} 运行成功`, tone: "success" },
            { key: "failed", label: `${employee.failedCount} 失败`, tone: employee.failedCount > 0 ? "danger" : "muted" },
          ],
        })),
      })
    : createEmptySection("agent-usage-employees-empty", { content: "所选周期暂无员工使用记录。" });
  return [createSectionSection("agent-usage-employees", { title: `${data.period.label}员工使用`, sections: [list] })];
}

function tokenSections(data: AgentUsageData): BodySurfaceSectionSpec[] {
  const total = tokenTotal(data.metrics);
  const list = data.tokenUsage.length > 0
    ? createListSection("agent-usage-token-list", {
        presentation: "list",
        items: data.tokenUsage.map((item) => ({
          key: item.key,
          title: item.agentName,
          description: item.capturedRunCount > 0
            ? `普通输入 ${formatCount(item.inputOtherTokens)} · 缓存读取 ${formatCount(item.inputCacheReadTokens)} · 缓存写入 ${formatCount(item.inputCacheCreationTokens)} · 输出 ${formatCount(item.outputTokens)}`
            : "该 Agent 的历史运行尚未采集 Token。",
          meta: `上下文占用峰值 ${formatContextUsage(item.contextUsagePeak)}`,
          trailing: item.capturedRunCount > 0 ? `已采集 ${formatCount(tokenTotal(item))} Token` : "未采集",
          badges: [
            { key: "coverage", label: `${item.capturedRunCount} / ${item.runCount} 轮有用量`, tone: item.capturedRunCount === item.runCount && item.runCount > 0 ? "success" : "warning" },
          ],
        })),
      })
    : createEmptySection("agent-usage-token-empty", { content: "所选周期暂无 Agent 运行。" });

  return [
    createMetricsSection("agent-usage-token-metrics", {
      metrics: [
        { key: "total", label: "已采集 Token", value: data.metrics.tokenCapturedRunCount > 0 ? formatCount(total) : "未采集" },
        { key: "coverage", label: "采集覆盖", value: `${formatCount(data.metrics.tokenCapturedRunCount)} / ${formatCount(data.metrics.runCount)} 轮` },
        { key: "input", label: "普通输入", value: formatCapturedTokenCount(data.metrics.inputOtherTokens, data.metrics.tokenCapturedRunCount) },
        { key: "cache-read", label: "缓存读取", value: formatCapturedTokenCount(data.metrics.inputCacheReadTokens, data.metrics.tokenCapturedRunCount) },
        { key: "cache-create", label: "缓存写入", value: formatCapturedTokenCount(data.metrics.inputCacheCreationTokens, data.metrics.tokenCapturedRunCount) },
        { key: "output", label: "输出", value: formatCapturedTokenCount(data.metrics.outputTokens, data.metrics.tokenCapturedRunCount) },
        { key: "context", label: "上下文占用峰值", value: formatContextUsage(data.metrics.contextUsagePeak) },
      ],
    }),
    createSectionSection("agent-usage-token-by-agent", { title: "按 Agent", sections: [list] }),
    createMessageSection("agent-usage-token-note", {
      content: "这里仅汇总 SDK 已返回用量的运行轮次，不把未采集历史补零，也不把部分采集值冒充总量。当前未保存模型与价格快照，因此不展示成本。",
      tone: "muted",
    }),
  ];
}

function sessionSections(data: AgentUsageData): BodySurfaceSectionSpec[] {
  if (!data.canAudit) {
    return [createMessageSection("agent-usage-session-audit-required", {
      content: "会话标题、页面来源和摘要需要 agent.usage.audit 权限。",
      tone: "warning",
    })];
  }
  const list = data.sessions.length > 0
    ? createListSection("agent-usage-sessions-list", {
        presentation: "list",
        items: data.sessions.map((session) => {
          const status = STATUS_VIEW[session.status];
          return {
            key: session.id,
            title: session.title,
            description: session.summaryShort || session.contextLabel || session.pagePath || "未生成会话摘要",
            meta: `${session.employeeName} · ${session.agentName} · ${formatDateTime(session.lastUsedAt)}`,
            trailing: session.capturedRunCount === 0 || session.totalTokens == null
              ? "Token 未采集"
              : `已采集 ${formatCount(session.totalTokens)} Token · ${session.capturedRunCount}/${session.runCount} 轮`,
            badges: [
              { key: "status", label: status.label, tone: status.tone },
              { key: "runs", label: `${session.runCount} 轮`, tone: "muted" },
            ],
          };
        }),
      })
    : createEmptySection("agent-usage-sessions-empty", { content: "所选周期暂无会话。" });
  return [
    createSectionSection("agent-usage-sessions", { title: `最近 ${data.sessions.length} 个会话`, sections: [list] }),
    createMessageSection("agent-usage-session-summary-note", {
      content: "短摘要仅来自长会话压缩，不是员工填写的任务目标；没有摘要时保留页面上下文，不读取原始 transcript。",
      tone: "muted",
    }),
  ];
}

export function AgentUsageClient({ data }: Props) {
  const tabs = getPageViewTabs("/agent/usage");
  const [active, setActive] = useState(tabs[0]?.key ?? "overview");
  const sections = active === "employees"
    ? employeeSections(data)
    : active === "tokens"
      ? tokenSections(data)
      : active === "sessions"
        ? sessionSections(data)
        : overviewSections(data);

  return (
    <PageSurface
      kind="standard"
      tabbar={createPageTabBar({ items: tabs, active, onChange: setActive, ariaLabel: "Agent 使用分析视图" })}
      body={createPageBody(sections)}
    />
  );
}
