import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import { requireRouteActionAccess } from "@workspace/platform/server/auth";
import { sourceCodeAgentTools } from "@workspace/platform/server/agent";
import { getAgentConfigurationData } from "@workspace/platform/server/agent/management-directory";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { AgentConfigurationClient } from "@workspace/platform/ui/AgentConfigurationClient";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function AgentConfigurationPage() {
  const user = await requireRouteActionAccess("/agent/config", "read");
  const [data, canConfigure] = await Promise.all([
    getAgentConfigurationData({
      viewerUserId: user.id,
      registeredWorkspaceTools: [
        ...sourceCodeAgentTools,
        ...hrAgentTools,
        ...financeAgentTools,
        ...libraryAgentTools,
      ],
    }),
    evaluatePermissionAction(user.id, "agent.config", "configure"),
  ]);

  return renderAppShellPage({
    title: "Agent 配置",
    backHref: "/agent",
    user,
    children: <AgentConfigurationClient data={data} canConfigure={canConfigure} />,
  });
}
