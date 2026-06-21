import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceImportClient, FinanceShell } from "@workspace/finance/ui";

export default async function ImportPage() {
  const user = await requireResourceAccess("finance.import");
  return (
    <AppShell title="数据导入" backHref="/finance" user={user}>
      <FinanceShell activeNav="import" user={user} hideShell>
        <FinanceImportClient user={user} />
      </FinanceShell>
    </AppShell>
  );
}
