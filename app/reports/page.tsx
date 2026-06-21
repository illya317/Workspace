import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { WorkReportPage } from "@workspace/work/ui";

export default async function ReportsPage() {
  const user = await requireResourceAccess("work.report");
  return (
    <AppShell title="工作汇报" backHref="/work" user={user}>
      <WorkReportPage hideShell />
    </AppShell>
  );
}
