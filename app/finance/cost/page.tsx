import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import FinanceCostClient from "./FinanceCostClient";

export default async function FinanceCostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinanceCost) redirect("/portal");
  return (
    <AppShell title="成本管理" backHref="/finance" user={user}>
      <FinanceShell activeNav="cost" user={user} hideShell>
        <FinanceCostClient user={user} />
      </FinanceShell>
    </AppShell>
  );
}
