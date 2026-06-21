import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceCostClient, FinanceShell } from "@workspace/finance/ui";

export default async function FinanceCostPage() {
  const user = await requireRouteAccess("/finance/cost");
  return (
    <AppShell title="成本管理" backHref="/finance" user={user}>
      <FinanceShell activeNav="cost" user={user} hideShell>
        <FinanceCostClient user={user} />
      </FinanceShell>
    </AppShell>
  );
}
