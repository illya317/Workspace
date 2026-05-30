import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import FinanceCostClient from "./FinanceCostClient";

export default async function FinanceCostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="cost" user={user}>
      <FinanceCostClient user={user} />
    </FinanceShell>
  );
}
