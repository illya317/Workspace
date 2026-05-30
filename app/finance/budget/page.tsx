import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import BudgetClient from "./BudgetClient";

export default async function BudgetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="budget" user={user}>
      <BudgetClient />
    </FinanceShell>
  );
}
