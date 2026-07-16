import { createApiRouteHandler, createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildAgentPermissionGrantBatchCommand,
  executeAgentPermissionGrantBatchCommand,
  getAgentPermissionGrantDataForActor,
} from "@workspace/platform/server/agent/permission-management-service";
import {
  agentPermissionGrantBatchSchema,
  agentPermissionGrantQuerySchema,
} from "@workspace/platform/server/agent/permission-management-schema";

export const GET = createApiRouteHandler({
  querySchema: agentPermissionGrantQuerySchema,
  queryError: "Agent 权限查询参数无效",
  handler: ({ query, user }) => getAgentPermissionGrantDataForActor({
    actorUserId: user.userId,
    subjectType: query.subjectType,
    resourceKey: query.resourceKey,
  }),
});

export const PUT = createCommandRoute({
  bodySchema: agentPermissionGrantBatchSchema,
  bodyError: "Agent 权限变更参数无效",
  buildCommand: ({ body, user }) => buildAgentPermissionGrantBatchCommand({
    actorUserId: user.userId,
    request: body,
  }),
  action: executeAgentPermissionGrantBatchCommand,
});
