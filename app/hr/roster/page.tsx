import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import HRClient from "../HRClient";

export default async function HRRosterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessHR) redirect("/portal");
  return (
    <AppShell title="人事基础资料" backHref="/hr" user={user}>
      <HRClient user={user} hideShell />
    </AppShell>
  );
}
