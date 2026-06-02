import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import ReviewClient from "./ReviewClient";

export default async function StatementReviewPage() {
  const user = await requireResourceAccess("finance.statement");
  return (
    <AppShell title="报表校对" backHref="/finance" user={user}>
      <FinanceShell activeNav="statementReview" user={user}>
        <main className="mx-auto max-w-6xl px-4 py-6">
          <ReviewClient />
        </main>
      </FinanceShell>
    </AppShell>
  );
}
