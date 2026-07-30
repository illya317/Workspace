import { z } from "zod";

import {
  projectNotificationAudiencePolicySchema,
  projectNotificationChannelPolicySchema,
} from "./project-notification-audience-validation";
import { projectNotificationConditionSchema } from "./project-notification-condition";
import { PROJECT_NOTIFICATION_SIGNAL_KINDS } from "../project-notification-signal-contract";

export const projectNotificationEventTypeSchema = z.enum(PROJECT_NOTIFICATION_SIGNAL_KINDS);

export const projectNotificationRuleEditableSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(
    /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
    "规则 key 只能使用小写字母、数字、点、下划线和连字符",
  ),
  label: z.string().trim().min(1).max(120),
  definitionKey: z.string().trim().min(1).max(120).regex(
    /^custom\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
    "通知定义必须使用 custom.* 命名空间",
  ),
  eventType: projectNotificationEventTypeSchema,
  condition: projectNotificationConditionSchema,
  audiencePolicy: projectNotificationAudiencePolicySchema,
  channelPolicy: projectNotificationChannelPolicySchema,
  cooldownSeconds: z.coerce.number().int().min(0).max(31_536_000),
}).strict();

export const projectNotificationRuleCreateSchema = projectNotificationRuleEditableSchema;
export const projectNotificationRuleUpdateSchema = projectNotificationRuleEditableSchema.extend({
  version: z.coerce.number().int().positive(),
}).strict();
export const projectNotificationRuleVersionSchema = z.object({
  version: z.coerce.number().int().positive(),
}).strict();
export const projectNotificationEvaluationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(50),
}).strict();

export type ProjectNotificationRuleEditable = z.infer<typeof projectNotificationRuleEditableSchema>;
