import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { EmployeePerformanceClient } from "@workspace/hr/ui";

export default async function WorkPerformancePage() {
  const user = await requireRouteAccess("/work/me");
  return renderAppShellPage({
    title: "绩效评审",
    backHref: "/work/me",
    user,
    children: <EmployeePerformanceClient user={user} hideShell />,
  });
}
