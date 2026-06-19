import { requireAuth } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import InvestorsClient from "./InvestorsClient";

export default async function InvestorsPage() {
  const user = await requireAuth();

  return (
    <AppShell title="投资人关系" backHref="/external" user={user}>
      <InvestorsClient />
    </AppShell>
  );
}
