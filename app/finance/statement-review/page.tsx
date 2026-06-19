import { Suspense } from "react";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import { PageContent } from "@workspace/core/ui";
import ReviewClient from "./ReviewClient";

export default async function StatementReviewPage() {
  const user = await requireResourceAccess("finance.statement");
  return (
    <AppShell title="报表校对" backHref="/finance" user={user}>
      <FinanceShell activeNav="statementReview" user={user} hideShell>
        <PageContent className="max-w-6xl">
          <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
            <ReviewClient />
          </Suspense>
        </PageContent>
      </FinanceShell>
    </AppShell>
  );
}
