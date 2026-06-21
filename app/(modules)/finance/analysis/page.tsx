import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceAnalysisClient, FinanceShell } from "@workspace/finance/ui";

export default async function FinanceAnalysisPage() {
  const user = await requireRouteAccess("/finance/analysis");
  return (
    <AppShell title="财务分析" backHref="/finance" user={user}>
      <FinanceShell activeNav="analysis" user={user} hideShell>
        <FinanceAnalysisClient user={user} />
      </FinanceShell>
    </AppShell>
  );
}
