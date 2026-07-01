import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { FinanceImportClient } from "@workspace/finance/ui";

export default async function FinanceImportPage() {
  const user = await requireRouteAccess("/finance/import");
  const canImport = await evaluatePermissionAction(user.id, "finance.import", "import");

  return renderAppShellPage({
    title: "数据导入",
    backHref: "/finance",
    user,
    children: <FinanceImportClient user={user} canImport={canImport} />,
  });
}
