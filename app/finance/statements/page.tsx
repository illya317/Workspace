import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import FinanceShell from "@/app/finance/components/FinanceShell";
import StatementsClient from "./StatementsClient";

export default async function StatementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinanceReport) redirect("/portal");
  return (
    <AppShell title="财务报表" backHref="/finance" user={user}>
      <FinanceShell activeNav="statements" user={user} hideShell>
        <StatementsClient />
      </FinanceShell>
    </AppShell>
  );
}
