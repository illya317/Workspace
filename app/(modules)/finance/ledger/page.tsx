import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceShell, LedgerClient } from "@workspace/finance/ui";

export default async function LedgerPage() {
  const user = await requireResourceAccess("finance.ledger");
  const canWrite = user.visibleWriteResourceKeys?.includes("finance.ledger") ?? false;
  return (
    <AppShell title="总账基础" backHref="/finance" user={user}>
      <FinanceShell activeNav="ledger" user={user} hideShell>
        <LedgerClient canWrite={canWrite} />
      </FinanceShell>
    </AppShell>
  );
}
