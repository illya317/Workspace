import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildAgentActionCeilingUpdateCommand,
  executeAgentActionCeilingUpdateCommand,
} from "@workspace/platform/server/agent/permission-management-service";
import { agentActionCeilingUpdateSchema } from "@workspace/platform/server/agent/permission-management-schema";

export const PUT = createCommandRoute({
  bodySchema: agentActionCeilingUpdateSchema,
  bodyError: "Agent 全局动作上限参数无效",
  buildCommand: ({ body, user }) => buildAgentActionCeilingUpdateCommand({
    editorUserId: user.userId,
    request: body,
  }),
  action: executeAgentActionCeilingUpdateCommand,
});
