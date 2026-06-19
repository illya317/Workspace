import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const user = await requireResourceAccess("finance.import");
  return (
    <AppShell title="数据导入" backHref="/finance" user={user}>
      <FinanceShell activeNav="import" user={user} hideShell>
        <ImportClient user={user} />
      </FinanceShell>
    </AppShell>
  );
}
