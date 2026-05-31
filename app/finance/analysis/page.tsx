import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import FinanceAnalysisClient from "./FinanceAnalysisClient";

export default async function FinanceAnalysisPage() {
  const user = await requireResourceAccess("finance.analysis");
  return (
    <AppShell title="财务分析" backHref="/finance" user={user}>
      <FinanceShell activeNav="analysis" user={user} hideShell>
        <FinanceAnalysisClient user={user} />
      </FinanceShell>
    </AppShell>
  );
}
