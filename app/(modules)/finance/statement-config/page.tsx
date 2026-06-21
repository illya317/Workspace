import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceShell, StatementConfigClient } from "@workspace/finance/ui";

export default async function StatementConfigPage() {
  const user = await requireRouteAccess("/finance/statement-config");
  return (
    <AppShell title="报表配置" backHref="/finance" user={user}>
      <FinanceShell activeNav="statementConfig" user={user} hideShell>
        <StatementConfigClient />
      </FinanceShell>
    </AppShell>
  );
}
