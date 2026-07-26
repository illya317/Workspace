import type { DataQualitySeverity, DataQualityTrigger } from "@workspace/platform/data-quality-contract";

export type DataQualityAlertPayload = {
  runId: number;
  trigger: DataQualityTrigger;
  checkedAt: string;
  findingCount: number;
  criticalCount: number;
  warningCount: number;
  scope?: {
    resourceKey: string | null;
    resourceLabel: string;
    departmentId: number | null;
    departmentName: string | null;
  };
  href?: string;
  findings: Array<{
    fingerprint: string;
    severity: DataQualitySeverity;
    title: string;
    summary: string;
    count: number;
  }>;
};

function triggerLabel(trigger: DataQualityTrigger) {
  if (trigger === "scheduled") return "每日巡检";
  if (trigger === "mutation") return "业务变更复检";
  return "手工巡检";
}

export const dataQualityNotificationDefinition = {
  type: "platform.dataQuality.alert",
  description: "跨业务域数据质量巡检发现新增、升级或超期异常时提醒治理责任人",
  isImportant: true,
  isStrongReminder: true,
  requiresAcknowledgement: true,
  render: (payload: DataQualityAlertPayload) => ({
    title: [
      payload.criticalCount > 0 ? "数据质量严重异常" : "数据质量异常",
      payload.scope?.resourceLabel,
      payload.scope?.departmentName,
    ].filter(Boolean).join(" · "),
    body: [
      `${triggerLabel(payload.trigger)}发现 ${payload.findingCount} 项需关注规则，其中严重 ${payload.criticalCount} 项、警告 ${payload.warningCount} 项。`,
      ...payload.findings.slice(0, 5).map((finding) => `${finding.title}：${finding.summary}`),
      payload.findingCount > 5 ? `另有 ${payload.findingCount - 5} 项，请进入数据质量工作台处理。` : "",
    ].filter(Boolean).join("\n"),
    href: payload.href ?? "/settings/admin?tab=dataQuality",
    payload,
  }),
} as const;
