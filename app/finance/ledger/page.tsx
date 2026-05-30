import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import LedgerClient from "./LedgerClient";

export default async function LedgerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="ledger" user={user}>
      <LedgerClient />
    </FinanceShell>
  );
}
