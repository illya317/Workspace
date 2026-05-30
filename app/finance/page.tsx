import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "./components/FinanceShell";
import FinanceHomeClient from "./FinanceHomeClient";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="" user={user}>
      <FinanceHomeClient user={user} />
    </FinanceShell>
  );
}
