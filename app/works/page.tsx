import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import WorksClient from "./WorksClient";

export default async function WorksPage() {
  const user = await requireResourceAccess("work");
  return (
    <AppShell title="工作清单" backHref="/portal" navLinks={[{ label: "工作汇报", href: "/reports" }, { label: "历史记录", href: "/history" }]} user={user}>
      <WorksClient user={user} hideShell />
    </AppShell>
  );
}
