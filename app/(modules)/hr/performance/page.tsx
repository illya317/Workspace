import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { HRPerformanceClient } from "@workspace/hr/ui";

export default async function HRPerformancePage() {
  const user = await requireRouteAccess("/hr/performance");
  return createElement(
    AppShell,
    { title: "考勤绩效", backHref: "/hr", user },
    <HRPerformanceClient user={user} hideShell />,
  );
}
