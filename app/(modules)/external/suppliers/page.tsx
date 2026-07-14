import { SuppliersClient } from "@workspace/external/ui";
import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function SuppliersPage() {
  const user = await requireRouteAccess("/external/suppliers");
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    evaluatePermissionAction(user.id, "external.suppliers", "create"),
    evaluatePermissionAction(user.id, "external.suppliers", "update"),
    evaluatePermissionAction(user.id, "external.suppliers", "delete"),
  ]);
  return renderAppShellPage({
    title: "供应商管理",
    backHref: "/external",
    user,
    children: <SuppliersClient canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />,
  });
}
