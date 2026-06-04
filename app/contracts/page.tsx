import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import ContractsClient from "./ContractsClient";

export default async function ContractsPage() {
  const user = await requireResourceAccess("administration.contract");
  return (
    <AppShell title="合同台账" backHref="/administration" user={user}>
      <ContractsClient user={user} hideShell />
    </AppShell>
  );
}
