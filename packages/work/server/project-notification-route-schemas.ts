import { z } from "zod";

const projectNotificationRuleRequestShape = {
  key: z.unknown(),
  label: z.unknown(),
  definitionKey: z.unknown(),
  eventType: z.unknown(),
  condition: z.unknown(),
  audiencePolicy: z.unknown(),
  channelPolicy: z.unknown(),
  cooldownSeconds: z.unknown(),
};

export const projectNotificationRuleCreateRequestSchema = z.object(
  projectNotificationRuleRequestShape,
).strict();

export const projectNotificationRuleUpdateRequestSchema = z.object({
  ...projectNotificationRuleRequestShape,
  version: z.unknown(),
}).strict();

export const projectNotificationRuleVersionRequestSchema = z.object({
  version: z.unknown(),
}).strict();

export const projectNotificationEvaluationQueryRequestSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(50),
}).strict();
