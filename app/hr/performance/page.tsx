import { redirect } from "next/navigation";
import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import HRPerformanceClient from "./HRPerformanceClient";

export default async function HRPerformancePage() {
  const user = await requireResourceAccess("people.performance");
  if (!user.isActiveEmployee) redirect("/portal");
  return (
    <AppShell title="考勤绩效" backHref="/hr" user={user}>
      <HRPerformanceClient user={user} hideShell />
    </AppShell>
  );
}
