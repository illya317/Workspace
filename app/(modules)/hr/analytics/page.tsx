import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { HRAnalyticsClient } from "@workspace/hr/ui";

export default async function HRAnalyticsPage() {
  const user = await requireRouteAccess("/hr/analytics");
  return (
    <AppShell title="人力分析" backHref="/hr" user={user}>
      <HRAnalyticsClient user={user} hideShell />
    </AppShell>
  );
}
