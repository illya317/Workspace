import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceShell, StatementsClient } from "@workspace/finance/ui";

export default async function StatementsPage() {
  const user = await requireResourceAccess("finance.statement");
  return (
    <AppShell title="财务报表" backHref="/finance" user={user}>
      <FinanceShell activeNav="statements" user={user} hideShell>
        <StatementsClient />
      </FinanceShell>
    </AppShell>
  );
}
