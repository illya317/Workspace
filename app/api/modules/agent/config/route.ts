import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import {
  buildAgentConfigurationUpdateCommand,
  executeAgentConfigurationUpdateCommand,
} from "@workspace/platform/server/agent/configuration-service";
import { getAgentConfigurationData } from "@workspace/platform/server/agent/management-directory";
import { agentConfigurationUpdateSchema } from "@workspace/platform/server/agent/configuration-schema";
import { sourceCodeAgentTools } from "@workspace/platform/server/agent";
import { createApiRouteHandler, createCommandRoute } from "@workspace/platform/server/api-route";

const registeredWorkspaceTools = [
  ...sourceCodeAgentTools,
  ...hrAgentTools,
  ...financeAgentTools,
  ...libraryAgentTools,
];

export const GET = createApiRouteHandler({
  handler: ({ user }) => getAgentConfigurationData({
    viewerUserId: user.userId,
    registeredWorkspaceTools,
  }),
});

export const PUT = createCommandRoute({
  bodySchema: agentConfigurationUpdateSchema,
  bodyError: "Agent 配置参数无效",
  buildCommand: ({ body, user }) => buildAgentConfigurationUpdateCommand({
    editorUserId: user.userId,
    request: body,
    registeredWorkspaceTools,
  }),
  action: executeAgentConfigurationUpdateCommand,
});
