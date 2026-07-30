import { TaxClient } from "@workspace/finance/ui";
import { getDefaultFinanceLedgerScope } from "@workspace/finance/server/ledger/periods";
import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function FinanceTaxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRouteAccess("/finance/tax");
  const [canCreate, canUpdate, configuredScope, query] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.tax", "create"),
    evaluatePermissionAction(user.id, "finance.tax", "update"),
    getDefaultFinanceLedgerScope(),
    searchParams,
  ]);
  const defaultScope = scopeFromQuery(query) ?? configuredScope;

  return renderAppShellPage({
    title: "税务管理",
    backHref: "/finance",
    user,
    children: (
      <TaxClient
        canCreate={canCreate}
        canUpdate={canUpdate}
        defaultScope={defaultScope}
        user={user}
      />
    ),
  });
}

function scopeFromQuery(query: Record<string, string | string[] | undefined>) {
  const companyCode = single(query.companyCode)?.trim() ?? "";
  const year = Number(single(query.year));
  const month = Number(single(query.month));
  if (!companyCode || !Number.isInteger(year) || year < 2000 || year > 2099 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { companyCode, year, month };
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
