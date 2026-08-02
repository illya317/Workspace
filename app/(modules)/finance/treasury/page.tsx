import { TreasuryClient } from "@workspace/finance/ui";
import { getDefaultFinanceLedgerScope } from "@workspace/finance/server/ledger/periods";
import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function FinanceTreasuryPage() {
  const user = await requireRouteAccess("/finance/treasury");
  const [canCreate, canUpdate, defaultScope] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.treasury", "create"),
    evaluatePermissionAction(user.id, "finance.treasury", "update"),
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
        defaultScope={defaultScope}
        user={user}
      />
    ),
  });
}
