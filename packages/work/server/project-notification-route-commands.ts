import "server-only";

import { z } from "zod";

import {
  failCommand,
  okCommand,
} from "@workspace/platform/server/domain-validation";

import {
  projectNotificationRuleCreateSchema,
  projectNotificationRuleVersionSchema,
  projectNotificationRuleUpdateSchema,
} from "./project-notification-rules";

export const redriveProjectNotificationSignalSchema = z.object({
  signalId: z.string().trim().min(1),
  expectedAttemptCount: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
}).strict();

export function buildCreateProjectNotificationRuleCommand(input: {
  userId: number;
  projectId: number;
  body: unknown;
}) {
  const parsed = projectNotificationRuleCreateSchema.safeParse(input.body);
  return parsed.success
    ? okCommand({ ...input, body: parsed.data })
    : failCommand(parsed.error.issues[0]?.message ?? "项目通知规则无效", 400);
}

export function buildUpdateProjectNotificationRuleCommand(input: {
  userId: number;
  projectId: number;
  ruleId: number;
  body: unknown;
}) {
  const parsed = projectNotificationRuleUpdateSchema.safeParse(input.body);
  return parsed.success
    ? okCommand({ ...input, body: parsed.data })
    : failCommand(parsed.error.issues[0]?.message ?? "项目通知规则无效", 400);
}

export function buildProjectNotificationRuleTransitionCommand(input: {
  userId: number;
  projectId: number;
  ruleId: number;
  version: unknown;
}) {
  const parsed = projectNotificationRuleVersionSchema.safeParse({ version: input.version });
  return parsed.success
    ? okCommand({ ...input, version: parsed.data.version })
    : failCommand(parsed.error.issues[0]?.message ?? "规则版本无效", 400);
}

export function buildRedriveProjectNotificationSignalCommand(input: {
  userId: number;
  projectId: number;
  body: unknown;
}) {
  const parsed = redriveProjectNotificationSignalSchema.safeParse(input.body);
  return parsed.success
    ? okCommand({
      userId: input.userId,
      projectId: input.projectId,
      signalId: parsed.data.signalId,
      expectedAttemptCount: parsed.data.expectedAttemptCount,
      reason: parsed.data.reason,
    })
    : failCommand(parsed.error.issues[0]?.message ?? "项目通知信号重试请求无效", 400);
}
