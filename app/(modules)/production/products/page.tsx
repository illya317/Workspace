import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { ProductMasterClient } from "@workspace/production/ui";

export default async function ProductionProductsPage() {
  const user = await requireRouteAccess("/production/products");
  const [canCreate, canUpdate] = await Promise.all([
    evaluatePermissionAction(user.id, "production.products", "create"),
    evaluatePermissionAction(user.id, "production.products", "update"),
  ]);
  return renderAppShellPage({
    title: "产品主档",
    backHref: "/production",
    user,
    children: <ProductMasterClient canCreate={canCreate} canUpdate={canUpdate} />,
  });
}
