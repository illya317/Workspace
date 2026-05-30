import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import FinanceAnalysisClient from "./FinanceAnalysisClient";

export default async function FinanceAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinanceAnalysis) redirect("/portal");
  return (
    <AppShell title="财务分析" backHref="/finance" user={user}>
      <FinanceShell activeNav="analysis" user={user} hideShell>
        <FinanceAnalysisClient user={user} />
      </FinanceShell>
    </AppShell>
  );
}
