import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ContractsClient from "./ContractsClient";

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessContract) redirect("/portal");
  return (
    <AppShell title="合同台账" backHref="/administration" user={user}>
      <ContractsClient user={user} hideShell />
    </AppShell>
  );
}
