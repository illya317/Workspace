import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { InvestorsClient } from "@workspace/external/ui";

export default async function InvestorsPage() {
  const user = await requireResourceAccess("external.investor");

  return (
    <AppShell title="投资人关系" backHref="/external" user={user}>
      <InvestorsClient />
    </AppShell>
  );
}
