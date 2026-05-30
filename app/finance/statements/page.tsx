import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import StatementsClient from "./StatementsClient";

export default async function StatementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinanceReport) redirect("/portal");
  return (
    <FinanceShell activeNav="statements" user={user}>
      <StatementsClient />
    </FinanceShell>
  );
}
