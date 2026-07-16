import { evaluatePermissionAction, requireRouteActionAccess } from "@workspace/platform/server/auth";
import { getAgentReportsData } from "@workspace/platform/server/agent/management-directory";
import { AgentReportsClient } from "@workspace/platform/ui/AgentReportsClient";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function AgentReportsPage() {
  const user = await requireRouteActionAccess("/agent/reports", "read");
  const canAudit = await evaluatePermissionAction(user.id, "agent.reports", "audit");
  const data = await getAgentReportsData({ canAudit });

  return renderAppShellPage({
    title: "任务汇报",
    backHref: "/agent",
    user,
    children: <AgentReportsClient data={data} />,
  });
}
