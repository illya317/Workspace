import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import InvestorsClient from "./InvestorsClient";

export default async function InvestorsPage() {
  const user = await requireResourceAccess("external.investor");

  return (
    <AppShell title="投资人关系" backHref="/external" user={user}>
      <InvestorsClient />
    </AppShell>
  );
}
