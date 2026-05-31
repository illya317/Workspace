import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import HRClient from "../HRClient";

export default async function HRRosterPage() {
  const user = await requireResourceAccess("people.roster");
  return (
    <AppShell title="人事基础资料" backHref="/hr" user={user}>
      <HRClient user={user} hideShell />
    </AppShell>
  );
}
