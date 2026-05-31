import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import LedgerClient from "./LedgerClient";

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
