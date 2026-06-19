import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
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
