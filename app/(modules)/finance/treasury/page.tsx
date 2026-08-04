import { TreasuryClient } from "@workspace/finance/ui";
import { getDefaultFinanceLedgerScope } from "@workspace/finance/server/ledger/periods";
import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function FinanceTreasuryPage() {
  const user = await requireRouteAccess("/finance/treasury");
  const [canCreate, canUpdate, canExport, defaultScope] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.treasury", "create"),
    evaluatePermissionAction(user.id, "finance.treasury", "update"),
    evaluatePermissionAction(user.id, "finance.treasury", "export"),
    getDefaultFinanceLedgerScope(),
  ]);

  return renderAppShellPage({
    title: "资金管理",
    backHref: "/finance",
    user,
    children: (
      <TreasuryClient
        canCreate={canCreate}
        canUpdate={canUpdate}
        canExport={canExport}
        defaultScope={defaultScope}
        user={user}
      />
    ),
  });
}
