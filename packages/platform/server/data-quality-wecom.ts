import "server-only";

import type { DataQualityFinding, DataQualityTrigger } from "@workspace/platform/data-quality-contract";
import { dataQualityWecomWebhook } from "./data-quality-policy";

type WecomWebhookResponse = {
  errcode?: number;
  errmsg?: string;
};

function triggerLabel(trigger: DataQualityTrigger) {
  if (trigger === "scheduled") return "每日巡检";
  if (trigger === "mutation") return "业务变更复检";
  return "手工巡检";
}

function severityLabel(severity: DataQualityFinding["severity"]) {
  if (severity === "critical") return "严重";
  if (severity === "warning") return "警告";
  return "提示";
}

export async function sendDataQualityWecomGroupAlert(input: {
  runId: number;
  trigger: DataQualityTrigger;
  findings: DataQualityFinding[];
  scope: { resourceLabel: string; departmentName: string | null; href: string };
}) {
  const webhook = dataQualityWecomWebhook();
  if (!webhook) throw new Error("WECOM_DATA_QUALITY_WEBHOOK_URL is not configured or invalid");
  const criticalCount = input.findings.filter((finding) => finding.severity === "critical").length;
  const warningCount = input.findings.filter((finding) => finding.severity === "warning").length;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  const appOrigin = process.env.NEXTAUTH_URL?.trim()?.replace(/\/$/, "") ?? "";
  const targetUrl = appOrigin ? `${appOrigin}${basePath === "/" ? "" : basePath}${input.scope.href}` : "";
  const lines = [
    `## 业务资料异常 · ${[input.scope.resourceLabel, input.scope.departmentName].filter(Boolean).join(" · ")}`,
    triggerLabel(input.trigger),
    `本次需关注 **${input.findings.length}** 项规则异常，其中严重 ${criticalCount} 项、警告 ${warningCount} 项。`,
    ...input.findings.slice(0, 6).map((finding) => (
      `> **[${severityLabel(finding.severity)}] ${finding.title}**\n> ${finding.summary}`
    )),
    input.findings.length > 6 ? `> 另有 ${input.findings.length - 6} 项，请进入工作台处理。` : "",
    targetUrl ? `[打开处理入口](${targetUrl})` : `巡检批次 #${input.runId}`,
  ].filter(Boolean);
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { content: lines.join("\n\n") },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`WeCom group webhook failed with HTTP ${response.status}`);
  const payload = await response.json().catch(() => null) as WecomWebhookResponse | null;
  if (!payload || payload.errcode !== 0) {
    throw new Error(`WeCom group webhook failed: ${payload?.errcode ?? "invalid response"} ${payload?.errmsg ?? ""}`.trim());
  }
}

export async function sendDataQualityWecomGroupTest() {
  const webhook = dataQualityWecomWebhook();
  if (!webhook) throw new Error("企微群机器人未配置");
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { content: "## Workspace 业务资料提醒测试\n\n企微群机器人通道已连接。后续仅在异常首次出现、严重度升级或超过重复提醒周期时推送。" },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`企微群机器人测试失败 (${response.status})`);
  const payload = await response.json().catch(() => null) as WecomWebhookResponse | null;
  if (!payload || payload.errcode !== 0) throw new Error(payload?.errmsg || "企微群机器人测试失败");
  return { success: true as const };
}
