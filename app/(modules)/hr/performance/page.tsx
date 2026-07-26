import { HrPerformanceClient } from "@workspace/hr/ui";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function HrPerformancePage() {
  const user = await requireRouteAccess("/hr/performance");

  return renderAppShellPage({
    title: "绩效管理",
    backHref: "/hr",
    user,
    children: <HrPerformanceClient user={user} hideShell />,
  });
}
