import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import BudgetClient from "./BudgetClient";

export default async function BudgetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinanceBudget) redirect("/portal");
  return (
    <AppShell title="预算管理" backHref="/finance" user={user}>
      <FinanceShell activeNav="budget" user={user} hideShell>
        <BudgetClient />
      </FinanceShell>
    </AppShell>
  );
}
