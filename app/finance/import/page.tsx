import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinanceImport) redirect("/portal");
  return (
    <FinanceShell activeNav="import" user={user}>
      <ImportClient user={user} />
    </FinanceShell>
  );
}
