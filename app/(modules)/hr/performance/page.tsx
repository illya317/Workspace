import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { HRPerformanceClient } from "@workspace/hr/ui";

export default async function HRPerformancePage() {
  const user = await requireResourceAccess("hr.performance");
  return (
    <AppShell title="考勤绩效" backHref="/hr" user={user}>
      <HRPerformanceClient user={user} hideShell />
    </AppShell>
  );
}
