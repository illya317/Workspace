import type { SessionUser } from "@workspace/platform/types";
import AppShell from "../AppShell";
import { AdminClient } from "../admin";
import { SettingsClient } from "../settings";

export function SettingsRootPageView({ user }: { user: SessionUser }) {
  return (
    <AppShell title="设置" backHref="/portal" user={user}>
      <SettingsClient user={user} hideShell />
    </AppShell>
  );
}

export function AdminManagePageView({ user }: { user: SessionUser }) {
  return (
    <AppShell title="管理后台" backHref="/settings" user={user}>
      <AdminClient user={user} />
    </AppShell>
  );
}
