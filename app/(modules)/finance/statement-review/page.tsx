import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceShell, StatementReviewClient } from "@workspace/finance/ui";

export default async function StatementReviewPage() {
  const user = await requireRouteAccess("/finance/statement-review");
  return (
    <AppShell title="报表校对" backHref="/finance" user={user}>
      <FinanceShell activeNav="statementReview" user={user} hideShell>
        <StatementReviewClient />
      </FinanceShell>
    </AppShell>
  );
}
