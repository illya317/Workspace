import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { GovernanceWorkspaceClient } from "@workspace/capital-securities/ui";

export default async function GovernancePage() {
  const user = await requireRouteAccess("/capital-securities/governance");
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    evaluatePermissionAction(user.id, "capitalSecurities.governance", "create"),
    evaluatePermissionAction(user.id, "capitalSecurities.governance", "update"),
    evaluatePermissionAction(user.id, "capitalSecurities.governance", "delete"),
  ]);

  return renderAppShellPage({
    title: "治理架构",
    backHref: "/capital-securities",
    user,
    children: <GovernanceWorkspaceClient canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />,
  });
}
