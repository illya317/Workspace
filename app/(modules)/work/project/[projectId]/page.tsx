import { getResourceDef } from "@workspace/platform/resources";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getWorkProjectPageActionPermissions, listWorkTaskSpaces } from "@workspace/work/server";
import { ProjectTab } from "@workspace/work/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { WorkUser } from "@workspace/work/types";

function toWorkUser(user: SessionUser): WorkUser {
  return {
    id: user.id,
    name: user.employeeName,
    isAdmin: user.isSuperAdmin ?? false,
    company: user.company ?? null,
  };
}

export default async function WorkProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireRouteAccess("/work/project");
  const { projectId } = await params;
  const projectNumber = Number(projectId);
  const [actionPermissions, navigation] = await Promise.all([
    getWorkProjectPageActionPermissions(user.id),
    listWorkTaskSpaces(user.id),
  ]);

  return <ProjectTab
    shellUser={user}
    shellTitle={getResourceDef("work.projects")?.name ?? "项目管理"}
    user={toWorkUser(user)}
    actionPermissions={actionPermissions}
    initialProjectId={Number.isInteger(projectNumber) && projectNumber > 0 ? projectNumber : null}
    navigation={navigation}
    contributions={[{
      key: "business-analysis",
      label: "经营分析",
      order: 100,
      hrefTemplate: "/finance/cost/workspace/project/:projectId",
    }]}
  />;
}
