import { createElement } from "react";
import type { SessionUser } from "@workspace/platform/types";
import AppShell from "../AppShell";
import { AdminClient } from "../admin";
import { SettingsClient } from "../settings";

export function SettingsRootPageView({ user }: { user: SessionUser }) {
  return createElement(
    AppShell,
    { title: "设置", backHref: "/portal", user },
    <SettingsClient user={user} hideShell />,
  );
}

export function AdminManagePageView({ user }: { user: SessionUser }) {
  return createElement(
    AppShell,
    { title: "管理后台", backHref: "/settings", user },
    <AdminClient user={user} />,
  );
}
