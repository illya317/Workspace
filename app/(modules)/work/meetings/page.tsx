import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { renderMeetingsModulePage } from "@workspace/work/ui";

export default async function WorkMeetingsPage() {
  const user = await requireRouteAccess("/work/meetings");
  const canCreate = await evaluatePermissionAction(user.id, "work.meetings", "create");

  return renderAppShellPage({
    title: "会议管理",
    backHref: "/work",
    user,
    children: renderMeetingsModulePage({ user, canCreate }),
  });
}
