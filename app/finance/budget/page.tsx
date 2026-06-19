import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import BudgetClient from "./BudgetClient";

export default async function BudgetPage() {
  const user = await requireResourceAccess("finance.budget");
  return (
    <AppShell title="预算管理" backHref="/finance" user={user}>
      <FinanceShell activeNav="budget" user={user} hideShell>
        <BudgetClient />
      </FinanceShell>
    </AppShell>
  );
}
