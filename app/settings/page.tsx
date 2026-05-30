import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell title="设置" backHref="/portal" backLabel="返回入口" user={user}>
      <SettingsClient user={user} hideShell />
    </AppShell>
  );
}
