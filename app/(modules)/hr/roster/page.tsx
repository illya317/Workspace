import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { HRClient } from "@workspace/hr/ui";

export default async function HRRosterPage() {
  const user = await requireRouteAccess("/hr/roster");
  return createElement(
    AppShell,
    { title: "人事基础资料", backHref: "/hr", user },
    <HRClient user={user} hideShell />,
  );
}
