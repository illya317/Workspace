import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { BudgetTab, FinanceShell } from "@workspace/finance/ui";

export default async function BudgetPage() {
  const user = await requireRouteAccess("/finance/budget");
  return (
    <AppShell title="预算管理" backHref="/finance" user={user}>
      <FinanceShell activeNav="budget" user={user} hideShell>
        <BudgetTab />
      </FinanceShell>
    </AppShell>
  );
}
