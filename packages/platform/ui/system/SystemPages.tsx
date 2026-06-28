import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";
import { AdminClient } from "../admin";
import { SettingsClient } from "../settings";

export function SettingsRootPageView({ user }: { user: SessionUser }) {
  return renderAppShellPage({
    title: "设置",
    backHref: "/portal",
    user,
    children: <SettingsClient user={user} hideShell />,
  });
}

export function AdminManagePageView({ user }: { user: SessionUser }) {
  return renderAppShellPage({
    title: "管理后台",
    backHref: "/settings",
    user,
    children: <AdminClient user={user} />,
  });
}
