import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import HistoryPage from "./HistoryClient";

export default async function HistoryServerPage() {
  const user = await requireResourceAccess("work.history");
  return (
    <AppShell title="历史记录" backHref="/work" user={user}>
      <HistoryPage hideShell />
    </AppShell>
  );
}
