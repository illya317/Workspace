import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import SchedulesClient from "./SchedulesClient";

export default async function SchedulesPage() {
  const user = await getCurrentUser();
  // layout.tsx already gated via requireResourceAccess("finance.schedules")
  if (!user) return null;
  return (
    <AppShell title="附注明细" backHref="/finance" user={user}>
      <SchedulesClient />
    </AppShell>
  );
}
