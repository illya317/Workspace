import { AssetsClient } from "@workspace/finance/ui";
import { resolveFinanceAssetCreateActionRuntimes } from "@workspace/finance/server/assets/approvals";
import { getDefaultFinanceLedgerScope } from "@workspace/finance/server/ledger/periods";
import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function FinanceAssetsPage() {
  const user = await requireRouteAccess("/finance/assets");
  const [canCreate, canUpdate, canRevise, canExport, defaultScope, assetCreateActionRuntimes] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.assets", "create"),
    evaluatePermissionAction(user.id, "finance.assets", "update"),
    evaluatePermissionAction(user.id, "finance.assets", "revise"),
    evaluatePermissionAction(user.id, "finance.assets", "export"),
    getDefaultFinanceLedgerScope(),
    resolveFinanceAssetCreateActionRuntimes(user.id),
  ]);

  return renderAppShellPage({
    title: "资产会计",
    backHref: "/finance",
    user,
    children: (
      <AssetsClient
        canCreate={canCreate}
        canUpdate={canUpdate}
        canRevise={canRevise}
        canExport={canExport}
        defaultScope={defaultScope}
        assetCreateActionRuntimes={assetCreateActionRuntimes}
        user={user}
      />
    ),
  });
}
