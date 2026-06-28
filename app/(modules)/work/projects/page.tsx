import { getResourceDef } from "@workspace/platform/resources";
import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
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

export default createProtectedModulePage({
  route: "/work/projects",
  title: () => getResourceDef("work.projects")?.name ?? "项目管理",
  backHref: "/work",
  render: ({ user }) => <ProjectTab user={toWorkUser(user)} />,
});
