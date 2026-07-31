import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  buildCreateProjectNotificationRuleCommand,
  createProjectNotificationRule,
  projectNotificationRuleCreateRequestSchema,
  listProjectNotificationRules,
} from "@workspace/work/server";

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
  }),
  action: listProjectNotificationRules,
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: projectNotificationRuleCreateRequestSchema,
  bodyError: "项目通知规则无效",
  buildCommand: ({ params, body, user }) => buildCreateProjectNotificationRuleCommand({
    userId: user.userId,
    projectId: params.id,
    body,
  }),
  action: createProjectNotificationRule,
});
