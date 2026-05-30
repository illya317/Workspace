import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import HistoryPage from "./HistoryClient";

export default async function HistoryServerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell title="历史记录" backHref="/portal"
      navLinks={[{ label: "工作汇报", href: "/reports" }, { label: "工作清单", href: "/works" }]}
      user={user}>
      <HistoryPage hideShell />
    </AppShell>
  );
}
