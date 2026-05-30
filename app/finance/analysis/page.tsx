import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import FinanceAnalysisClient from "./FinanceAnalysisClient";

export default async function FinanceAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="analysis" user={user}>
      <FinanceAnalysisClient user={user} />
    </FinanceShell>
  );
}
