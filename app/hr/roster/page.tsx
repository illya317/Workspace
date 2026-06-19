import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import HRClient from "../HRClient";

export default async function HRRosterPage() {
  const user = await requireResourceAccess("people.roster");
  return (
    <AppShell title="人事基础资料" backHref="/hr" user={user}>
      <HRClient user={user} hideShell />
    </AppShell>
  );
}
