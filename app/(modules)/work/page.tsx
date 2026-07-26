import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { canEnterDefaultWorkDepartmentHome } from "@workspace/work/server";
import { WorkHomePageView } from "@workspace/work/ui";

export default async function WorkHomePage() {
  const user = await requireRouteAccess("/work");
  const canEnterDepartmentHome = await canEnterDefaultWorkDepartmentHome(user.id);

  return renderAppShellPage({
    title: "工作管理",
    backHref: "/portal",
    user,
    children: <WorkHomePageView user={user} canEnterDepartmentHome={canEnterDepartmentHome} />,
  });
}
