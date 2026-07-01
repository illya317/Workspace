import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { StatementConfigClient } from "@workspace/finance/ui";

export default async function FinanceStatementConfigPage() {
  const user = await requireRouteAccess("/finance/statement-config");
  const [canCreate, canWrite, canDelete] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.statementConfig", "create"),
    evaluatePermissionAction(user.id, "finance.statementConfig", "write"),
    evaluatePermissionAction(user.id, "finance.statementConfig", "delete"),
  ]);

  return renderAppShellPage({
    title: "报表配置",
    backHref: "/finance",
    user,
    children: <StatementConfigClient user={user} canCreate={canCreate} canWrite={canWrite} canDelete={canDelete} />,
  });
}
