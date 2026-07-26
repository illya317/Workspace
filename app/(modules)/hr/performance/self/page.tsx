import { EmployeePerformanceClient } from "@workspace/hr/ui";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

export default async function HrSelfPerformancePage() {
  const user = await requireRouteAccess("/work/performance");

  return renderAppShellPage({
    title: "我的绩效",
    backHref: "/work/me",
    user,
    children: <EmployeePerformanceClient user={user} hideShell />,
  });
}
