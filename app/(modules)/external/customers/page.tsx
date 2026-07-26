import { CustomersClient } from "@workspace/external/ui";
import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function CustomersPage() {
  const user = await requireRouteAccess("/external/customers");
  const [canCreate, canUpdate, canDelete, canReadSuppliers, canUpdateSuppliers] = await Promise.all([
    evaluatePermissionAction(user.id, "external.customers", "create"),
    evaluatePermissionAction(user.id, "external.customers", "update"),
    evaluatePermissionAction(user.id, "external.customers", "delete"),
    evaluatePermissionAction(user.id, "external.suppliers", "read"),
    evaluatePermissionAction(user.id, "external.suppliers", "update"),
  ]);
  return renderAppShellPage({
    title: "客户管理",
    backHref: "/external",
    user,
    children: (
      <CustomersClient
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canReadOtherRole={canReadSuppliers}
        canUpdateOtherRole={canUpdateSuppliers}
      />
    ),
  });
}
