import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";
import { AdminClient } from "../admin";

export function AdminManagePageView({ user }: { user: SessionUser }) {
  return renderAppShellPage({
    title: "管理后台",
    backHref: "/settings",
    user,
    children: <AdminClient user={user} />,
  });
}
