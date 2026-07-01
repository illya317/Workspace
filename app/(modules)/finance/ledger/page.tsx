import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { LedgerClient } from "@workspace/finance/ui";

export default async function FinanceLedgerPage() {
  const user = await requireRouteAccess("/finance/ledger");
  const [canWrite, canDelete, canRevise, canImport, canExport] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.ledger", "write"),
    evaluatePermissionAction(user.id, "finance.ledger", "delete"),
    evaluatePermissionAction(user.id, "finance.ledger", "revise"),
    evaluatePermissionAction(user.id, "finance.ledger", "import"),
    evaluatePermissionAction(user.id, "finance.ledger", "export"),
  ]);

  return renderAppShellPage({
    title: "总账基础",
    backHref: "/finance",
    user,
    children: (
    <LedgerClient
      canWrite={canWrite}
      canDelete={canDelete}
      canRevise={canRevise}
      canImport={canImport}
      canExport={canExport}
      user={user}
    />
    ),
  });
}
