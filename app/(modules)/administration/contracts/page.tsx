import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { ContractsClient } from "@workspace/administration/ui";

export default async function AdministrationContractsPage() {
  const user = await requireRouteAccess("/administration/contracts");
  const [canCreate, canWrite, canDelete] = await Promise.all([
    evaluatePermissionAction(user.id, "administration.contracts", "create"),
    evaluatePermissionAction(user.id, "administration.contracts", "write"),
    evaluatePermissionAction(user.id, "administration.contracts", "delete"),
  ]);

  return renderAppShellPage({
    title: "合同台账",
    backHref: "/administration",
    user,
    children: <ContractsClient
      user={user}
      hideShell
      canCreate={canCreate}
      canWrite={canWrite}
      canDelete={canDelete}
    />,
  });
}
