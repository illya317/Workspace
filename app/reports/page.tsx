import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import ReportPage from "./ReportsClient";

export default async function ReportsPage() {
  const user = await requireResourceAccess("work.report");
  return (
    <AppShell title="工作汇报" backHref="/work" user={user}>
      <ReportPage hideShell />
    </AppShell>
  );
}
