import { getResourceDef } from "@workspace/platform/resources";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getWorkProjectPageActionPermissions } from "@workspace/work/server";
import { ProjectTab } from "@workspace/work/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { WorkUser } from "@workspace/work/types";

function toWorkUser(user: SessionUser): WorkUser {
  return {
    id: user.id,
    name: user.employeeName || user.nickname,
    visibleResourceKeys: user.visibleResourceKeys || [],
    visibleWriteResourceKeys: user.visibleWriteResourceKeys || [],
    isAdmin: user.isSuperAdmin ?? false,
    company: user.company ?? null,
  };
}

export default async function WorkProjectsPage() {
  const user = await requireRouteAccess("/work/projects");
  const actionPermissions = await getWorkProjectPageActionPermissions(user.id);

  return renderAppShellPage({
    title: getResourceDef("work.projects")?.name ?? "项目管理",
    backHref: "/work",
    user,
    children: <ProjectTab user={toWorkUser(user)} actionPermissions={actionPermissions} />,
  });
}
