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
  label: "业务资料异常提醒",
  description: "业务资料巡检发现新增、升级或超期异常时提醒治理责任人",
  groupKey: "business",
  groupLabel: "业务提醒",
  triggerDescription: "业务资料巡检发现新增、升级或超过提醒间隔的异常时。",
  recipientDescription: "拥有对应业务资料读取权限的用户可以自主订阅；管理员治理接收人仍按策略接收。",
  audienceMode: "optional",
  subscriptionMode: "optional",
  ownerResourceKey: "hr.roster",
  supportedChannels: ["workspace"],
  defaultChannel: "workspace",
  defaultCadence: "immediate",
  defaultEnabled: false,
  details: [
    "在职雇佣关系唯一",
    "在职员工当前任职完整，且主岗唯一",
    "当前任职的公司、部门和岗位完整",
    "当前任职工作占比填写完整且合计等于 1",
  ],
  recipientReason: "系统管理员为此业务范围配置了提醒",
  resourceKey: (payload: DataQualityAlertPayload) => payload.scope?.resourceKey ?? null,
  scopeId: (payload: DataQualityAlertPayload) => payload.scope?.departmentId
    ? `department:${payload.scope.departmentId}`
    : null,
  isImportant: true,
  isStrongReminder: true,
  requiresAcknowledgement: true,
  render: (payload: DataQualityAlertPayload) => ({
    title: [
      payload.criticalCount > 0 ? "业务资料严重异常" : "业务资料异常提醒",
      payload.scope?.resourceLabel,
      payload.scope?.departmentName,
    ].filter(Boolean).join(" · "),
    body: [
      `${triggerLabel(payload.trigger)}发现 ${payload.findingCount} 项需关注规则，其中严重 ${payload.criticalCount} 项、警告 ${payload.warningCount} 项。`,
      ...payload.findings.slice(0, 5).map((finding) => `${finding.title}：${finding.summary}`),
      payload.findingCount > 5 ? `另有 ${payload.findingCount - 5} 项，请进入对应业务资料处理。` : "",
    ].filter(Boolean).join("\n"),
    href: payload.href ?? "/settings/admin?tab=dataQuality",
    payload,
  }),
} as const;
