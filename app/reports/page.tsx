import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ReportPage from "./ReportsClient";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessWorks) redirect("/portal");
  return (
    <AppShell title="工作汇报" backHref="/portal" navLinks={[{ label: "工作清单", href: "/works" }, { label: "历史记录", href: "/history" }]} user={user}>
      <ReportPage hideShell />
    </AppShell>
  );
}
