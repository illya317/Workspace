import { z } from "zod";

export const WEEKLY_REPORT_MESSAGE_VARIABLES = [
  { key: "salutation", label: "问候语" },
  { key: "meeting_date", label: "会议日期" },
  { key: "meeting_type", label: "会议类型" },
  { key: "report_period", label: "汇报期间说明" },
  { key: "period_range", label: "汇报日期范围" },
  { key: "report_tab", label: "周报或月报" },
] as const;
export const WEEKLY_REPORT_DEFAULT_MESSAGE_TEMPLATE = [
  "工作汇报提醒",
  "",
  "{{salutation}}",
  "",
  "{{meeting_date}}召开{{meeting_type}}，请在新系统中完成{{report_period}}的填报（{{period_range}}），谢谢！",
  "",
  "部门/项目负责人请先在顶部「工作空间」切换至本人负责的部门或项目空间，再选择「工作汇报 → {{report_tab}}」。",
  "负责多个空间的，请逐一切换并填报；如未显示对应空间，请先在「个人设置」中配置「常用部门/常用项目」。",
  "手机端如提示扫码登录，可先截图，再从相册中识别二维码。",
].join("\n");
export const WEEKLY_REPORT_MESSAGE_RULE_SUMMARY =
  "第一行是通知标题，其余是正文。每周五按策略时间发送；当日最早一条使用上午问候，较晚一条使用再次提醒；当周五为当月最后一个周五时自动切换为月报口径，否则使用周报口径。";
const WEEKLY_REPORT_MESSAGE_VARIABLE_KEYS = new Set<string>(
  WEEKLY_REPORT_MESSAGE_VARIABLES.map((variable) => variable.key),
);
const WEEKLY_REPORT_MESSAGE_TOKEN_PATTERN = /{{([a-z][a-z0-9_]{0,63})}}/g;

export const weeklyReportMessageTemplateSchema = z.string().min(1).max(4000).superRefine((value, context) => {
  if (!value.trim()) {
    context.addIssue({ code: "custom", message: "通知原文不能为空" });
    return;
  }
  const withoutTokens = value.replace(WEEKLY_REPORT_MESSAGE_TOKEN_PATTERN, "");
  if (withoutTokens.includes("{{") || withoutTokens.includes("}}")) {
    context.addIssue({ code: "custom", message: "通知原文变量语法无效，应使用 {{flat_key}}" });
  }
  const unknown = [...new Set(
    [...value.matchAll(WEEKLY_REPORT_MESSAGE_TOKEN_PATTERN)]
      .map((match) => match[1]!)
      .filter((key) => !WEEKLY_REPORT_MESSAGE_VARIABLE_KEYS.has(key)),
  )];
  if (unknown.length > 0) {
    context.addIssue({ code: "custom", message: `通知原文包含未知变量：${unknown.join("、")}` });
  }
  const content = splitWeeklyReportNotificationContent(value);
  if (!content.title || content.title.length > 120) {
    context.addIssue({ code: "custom", message: "通知原文第一行必须是 1 至 120 字的标题" });
  }
  if (!content.body) {
    context.addIssue({ code: "custom", message: "通知原文必须在标题后填写正文" });
  }
});

export function splitWeeklyReportNotificationContent(value: string) {
  const [title = "", ...bodyLines] = value.replace(/\r\n?/g, "\n").split("\n");
  return { title: title.trim(), body: bodyLines.join("\n").trim() };
}

export const managedGroupStatusSchema = z.enum(["discovered", "unclaimed", "active", "suspended"]);
export const managedGroupVerificationStatusSchema = z.enum(["pending", "verified", "failed"]);
export const notificationGroupDataScopeSchema = z.object({
  type: z.enum(["workspace", "departments", "projects", "users"]),
  ids: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  label: z.string().trim().min(1).max(120),
}).strict().superRefine((value, context) => {
  if (value.type !== "workspace" && value.ids.length === 0) {
    context.addIssue({ code: "custom", path: ["ids"], message: "限定范围必须选择至少一个对象" });
  }
  if (value.type === "workspace" && value.ids.length > 0) {
    context.addIssue({ code: "custom", path: ["ids"], message: "全 Workspace 范围不接受对象 ID" });
  }
});
export const notificationGroupScheduleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual") }).strict(),
  z.object({
    mode: z.literal("weekly"),
    timezone: z.literal("Asia/Shanghai"),
    weekday: z.number().int().min(1).max(7),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).strict(),
]);
export const weeklyAgentKeySchema = z.literal("work.weekly-report");

export const managedGroupClaimSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  ownerUserId: z.number().int().positive().nullable().optional(),
  ownerPositionId: z.number().int().positive().nullable().optional(),
  expectedVersion: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (!value.ownerUserId && !value.ownerPositionId) {
    context.addIssue({ code: "custom", path: ["ownerUserId"], message: "必须指定群负责人用户或岗位" });
  }
});
export const managedGroupVerifySchema = z.object({
  expectedVersion: z.number().int().positive(),
}).strict();
export const managedGroupUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  status: managedGroupStatusSchema.exclude(["discovered"]).optional(),
  expectedVersion: z.number().int().positive(),
}).strict().refine((value) => value.displayName !== undefined || value.status !== undefined, {
  message: "至少提交一项群变更",
});
export const notificationGroupPolicyCreateSchema = z.object({
  key: z.string().trim().min(3).max(120).regex(/^[a-z][a-z0-9._-]+$/),
  groupKey: z.string().trim().min(3).max(80),
  definitionKey: z.string().trim().min(3).max(160),
  label: z.string().trim().min(1).max(120),
  dataScope: notificationGroupDataScopeSchema,
  schedule: notificationGroupScheduleSchema,
  messageTemplate: weeklyReportMessageTemplateSchema.nullable().optional(),
  weeklyAgentKey: weeklyAgentKeySchema.nullable().optional(),
  enabled: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.weeklyAgentKey && !value.messageTemplate?.trim()) {
    context.addIssue({ code: "custom", path: ["messageTemplate"], message: "绑定周报 Agent 时必须填写通知原文" });
  }
});
export const notificationGroupPolicyUpdateSchema = z.object({
  definitionKey: z.string().trim().min(3).max(160).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  dataScope: notificationGroupDataScopeSchema.optional(),
  schedule: notificationGroupScheduleSchema.optional(),
  messageTemplate: weeklyReportMessageTemplateSchema.nullable().optional(),
  weeklyAgentKey: weeklyAgentKeySchema.nullable().optional(),
  enabled: z.boolean().optional(),
  expectedVersion: z.number().int().positive(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), {
  message: "至少提交一项策略变更",
});
export const notificationGroupPublicationSchema = z.object({
  policyId: z.string().uuid(),
  variables: z.record(z.string(), z.string().max(4000)).default({}),
}).strict();

export type NotificationManagedGroupStatus = z.infer<typeof managedGroupStatusSchema>;
export type NotificationManagedGroupVerificationStatus = z.infer<typeof managedGroupVerificationStatusSchema>;
export type NotificationGroupDataScope = z.infer<typeof notificationGroupDataScopeSchema>;
export type NotificationGroupSchedule = z.infer<typeof notificationGroupScheduleSchema>;
