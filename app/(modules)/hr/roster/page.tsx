import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { HRClient } from "@workspace/hr/ui";

export default async function HrRosterPage() {
  const user = await requireRouteAccess("/hr/roster");
  const canArchiveRoster = await evaluatePermissionAction(user.id, "hr.roster", "archive");

  return renderAppShellPage({
    title: "人事基础资料",
    backHref: "/hr",
    user,
    children: <HRClient user={user} hideShell canArchiveRoster={canArchiveRoster} />,
  });
}
