import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { WorksClient } from "@workspace/work/ui";

export default async function WorksPage() {
  const user = await requireResourceAccess("work.task");
  return (
    <AppShell title="工作清单" backHref="/work" user={user}>
      <WorksClient user={user} hideShell />
    </AppShell>
  );
}
