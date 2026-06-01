import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import StatementConfigClient from "./StatementConfigClient";

export default async function StatementConfigPage() {
  const user = await requireResourceAccess("finance.statement");
  return (
    <AppShell title="报表配置" backHref="/finance" user={user}>
      <FinanceShell activeNav="statementConfig" user={user} hideShell>
        <StatementConfigClient />
      </FinanceShell>
    </AppShell>
  );
}
