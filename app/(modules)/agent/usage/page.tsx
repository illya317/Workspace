import { evaluatePermissionAction, requireRouteActionAccess } from "@workspace/platform/server/auth";
import { getAgentUsageData } from "@workspace/platform/server/agent/management-directory";
import { AgentUsageClient } from "@workspace/platform/ui/AgentUsageClient";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function AgentUsagePage() {
  const user = await requireRouteActionAccess("/agent/usage", "read");
  const canAudit = await evaluatePermissionAction(user.id, "agent.usage", "audit");
  const data = await getAgentUsageData({ canAudit });

  return renderAppShellPage({
    title: "使用分析",
    backHref: "/agent",
    user,
    children: <AgentUsageClient data={data} />,
  });
}
