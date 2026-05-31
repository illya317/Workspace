import { requireAuth } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import SchedulesClient from "./SchedulesClient";

export default async function SchedulesPage() {
  const user = await requireAuth();
  return (
    <AppShell title="附注明细" backHref="/finance" user={user}>
      <SchedulesClient />
    </AppShell>
  );
}
