import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getDefaultFinanceLedgerScope } from "@workspace/finance/server/ledger/periods";
import { LedgerClient } from "@workspace/finance/ui";

export default async function FinanceLedgerPage() {
  const user = await requireRouteAccess("/finance/ledger");
  const [canRevise, canExport, defaultScope] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.ledger", "revise"),
    evaluatePermissionAction(user.id, "finance.ledger", "export"),
    getDefaultFinanceLedgerScope(),
  ]);

  return renderAppShellPage({
    title: "总账基础",
    backHref: "/finance",
    user,
    children: (
    <LedgerClient
      canRevise={canRevise}
      canExport={canExport}
      defaultScope={defaultScope}
      user={user}
    />
    ),
  });
}
