import "server-only";

import { serviceError, serviceOk } from "../service-result";
import { validateNotificationDeliveryChannelsForActivation } from "./notification-delivery-outbox";
import { resolvePublishedDefinition } from "./notification-publishing-storage";
import { prisma, Prisma } from "./prisma";
import { weeklyReportMessageTemplateSchema } from "./wecom-group-notification-contract";

export async function validatePolicyReferences(
  groupKey: string,
  definitionKey: string,
  enabled: boolean,
  weeklyAgentKey: string | null,
  messageTemplate: string | null,
) {
  const groups = await prisma.$queryRaw<Array<{
    status: string;
    verificationStatus: string;
  }>>(Prisma.sql`
    SELECT "status", "verificationStatus"
    FROM "NotificationManagedGroup"
    WHERE "groupKey" = ${groupKey}
    LIMIT 1
  `);
  const group = groups[0];
  if (!group) return serviceError("企业微信群不存在", 404);
  const definition = await resolvePublishedDefinition(definitionKey);
  if (!definition) return serviceError("通知定义不存在、未发布或已归档", 400);
  if (weeklyAgentKey) {
    if (definition.variableKeys.length !== 1 || definition.variableKeys[0] !== "message") {
      return serviceError("周报 Agent 只能绑定唯一变量为 message 的通知定义", 400);
    }
    if (definition.bodyTemplate.trim() !== "{{message}}" || definition.hrefTemplate) {
      return serviceError("周报 Agent 的通知定义正文必须仅为 {{message}} 且不能附加隐藏链接", 400);
    }
    const template = weeklyReportMessageTemplateSchema.safeParse(messageTemplate);
    if (!template.success) {
      return serviceError(template.error.issues[0]?.message ?? "通知原文无效", 400);
    }
  }
  if (enabled && (group.status !== "active" || group.verificationStatus !== "verified")) {
    return serviceError("群必须已认领、命名并验证后才能启用策略", 409);
  }
  if (enabled) {
    const capability = await validateNotificationDeliveryChannelsForActivation(["wecom"]);
    if (capability.ok === false) return serviceError(capability.issue.message, capability.issue.status);
  }
  return serviceOk(true);
}
