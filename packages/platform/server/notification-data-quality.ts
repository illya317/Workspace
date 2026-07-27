import type { DataQualitySeverity, DataQualityTrigger } from "@workspace/platform/data-quality-contract";
import { listDataQualityProviderResourceKeys } from "@workspace/platform/data-quality-provider-registry";

export const DATA_QUALITY_AUTOMATION = {
  dailyAt: "08:30",
  minimumSeverity: "warning" as const,
  mutationTriggerEnabled: true,
  repeatAfterHours: 24,
} as const;

export function dataQualityNotificationProducerAvailable() {
  return process.env.DATA_QUALITY_SCHEDULER_DISABLED !== "1"
    && listDataQualityProviderResourceKeys().length > 0;
}

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
  type: "platform.businessData.alert",
  label: "业务资料异常提醒",
  description: "自动巡检发现新增、升级或超期业务资料异常时提醒已订阅用户",
  groupKey: "business",
  groupLabel: "业务提醒",
  triggerDescription: `每日 ${DATA_QUALITY_AUTOMATION.dailyAt} 自动巡检，并在业务资料变更后自动复检；异常首次出现、升级或超过 ${DATA_QUALITY_AUTOMATION.repeatAfterHours} 小时未处理时触发。`,
  recipientDescription: "仅发送给已订阅且投递时仍拥有对应业务资料读取权限的用户。",
  producerMode: "scheduled_and_event",
  producerAvailable: dataQualityNotificationProducerAvailable,
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
  recipientReason: "你订阅了业务资料异常提醒",
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
    href: payload.href ?? "/settings/account",
    payload,
  }),
} as const;
