import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { AppShell } from "@workspace/platform/ui";
import { SettingsClient } from "@workspace/platform/ui/settings";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell title="设置" backHref="/portal" user={user}>
      <SettingsClient user={user} hideShell />
    </AppShell>
  );
}
