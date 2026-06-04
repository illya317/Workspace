import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import ReportPage from "./ReportsClient";

export default async function ReportsPage() {
  const user = await requireResourceAccess("work");
  return (
    <AppShell title="工作汇报" backHref="/portal" navLinks={[{ label: "工作清单", href: "/works" }, { label: "历史记录", href: "/history" }]} user={user}>
      <ReportPage hideShell />
    </AppShell>
  );
}
