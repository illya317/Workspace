import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import StatementsClient from "./StatementsClient";

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
