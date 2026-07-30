import { z } from "zod";

import { notificationDefinitionVersionSchema } from "@workspace/platform/server/notification-definition-dsl";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { commitNotificationDefinitionArchivedState } from "@workspace/platform/server/notification-publishing";

const NOTIFICATION_DEFINITION_KEY_PATTERN = /^custom\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

const definitionParamsSchema = z.object({
  key: z.string().trim().min(1).max(120).regex(
    NOTIFICATION_DEFINITION_KEY_PATTERN,
    "通知定义 key 必须使用 custom.* 命名空间",
  ),
}).strict();

export const POST = createCommandRoute({
  paramsSchema: definitionParamsSchema,
  bodySchema: notificationDefinitionVersionSchema,
  paramsError: "通知定义无效",
  bodyError: "通知定义版本无效",
  buildCommand: ({ params, body }) => okCommand({
    definitionKey: params.key,
    expectedVersion: body.expectedVersion,
  }),
  action: (command, { user }) => commitNotificationDefinitionArchivedState(
    user.userId,
    command.definitionKey,
    command.expectedVersion,
  ),
});
