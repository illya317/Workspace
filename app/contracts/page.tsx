import { requireResourceAccess } from "@/server/auth/guard";
import { AppShell } from "@workspace/platform/ui";
import { ContractsClient } from "@workspace/administration/ui";

export default async function ContractsPage() {
  const user = await requireResourceAccess("administration.contract");
  return (
    <AppShell title="合同台账" backHref="/administration" user={user}>
      <ContractsClient user={user} hideShell />
    </AppShell>
  );
}
