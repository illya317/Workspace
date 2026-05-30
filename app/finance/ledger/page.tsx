import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import LedgerClient from "./LedgerClient";

export default async function LedgerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinanceLedger) redirect("/portal");
  return (
    <AppShell title="总账基础" backHref="/finance" user={user}>
      <FinanceShell activeNav="ledger" user={user} hideShell>
        <LedgerClient />
      </FinanceShell>
    </AppShell>
  );
}
