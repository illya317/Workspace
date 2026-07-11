import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { GovernanceArchitectureClient } from "@workspace/capital-securities/ui";

export default async function GovernancePage() {
  const user = await requireRouteAccess("/capital-securities/governance");
  const [canCreate, canUpdate] = await Promise.all([
    evaluatePermissionAction(user.id, "capitalSecurities.governance", "create"),
    evaluatePermissionAction(user.id, "capitalSecurities.governance", "update"),
  ]);

  return renderAppShellPage({
    title: "治理架构",
    backHref: "/capital-securities",
    user,
    children: <GovernanceArchitectureClient canCreate={canCreate} canUpdate={canUpdate} />,
  });
}
