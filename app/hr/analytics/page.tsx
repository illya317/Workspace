import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import HRAnalyticsClient from "./HRAnalyticsClient";

export default async function HRAnalyticsPage() {
  const user = await requireResourceAccess("people.analytics");
  return (
    <AppShell title="人力分析" backHref="/hr" user={user}>
      <HRAnalyticsClient user={user} hideShell />
    </AppShell>
  );
}
