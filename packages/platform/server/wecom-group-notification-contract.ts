import { z } from "zod";

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
  weeklyAgentKey: weeklyAgentKeySchema.nullable().optional(),
  enabled: z.boolean().default(false),
}).strict();
export const notificationGroupPolicyUpdateSchema = z.object({
  definitionKey: z.string().trim().min(3).max(160).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  dataScope: notificationGroupDataScopeSchema.optional(),
  schedule: notificationGroupScheduleSchema.optional(),
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
