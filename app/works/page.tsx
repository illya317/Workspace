import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import WorksClient from "./WorksClient";

export default async function WorksPage() {
  const user = await requireResourceAccess("work.task");
  return (
    <AppShell title="工作清单" backHref="/work" user={user}>
      <WorksClient user={user} hideShell />
    </AppShell>
  );
}
