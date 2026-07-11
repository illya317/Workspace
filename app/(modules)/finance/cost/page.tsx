import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { FinanceCostClient } from "@workspace/finance/ui";

export default async function FinanceCostPage() {
  const user = await requireRouteAccess("/finance/cost");
  const canDelete = await evaluatePermissionAction(user.id, "finance.cost", "delete");

  return renderAppShellPage({
    title: "成本管理",
    backHref: "/finance",
    user,
    children: <FinanceCostClient user={user} canDelete={canDelete} />,
  });
}
