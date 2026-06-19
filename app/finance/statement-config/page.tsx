import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
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
