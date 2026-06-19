import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import HistoryPage from "./HistoryClient";

export default async function HistoryServerPage() {
  const user = await requireResourceAccess("work.history");
  return (
    <AppShell title="历史记录" backHref="/work" user={user}>
      <HistoryPage hideShell />
    </AppShell>
  );
}
