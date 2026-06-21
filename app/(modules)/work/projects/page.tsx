import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getResourceDef } from "@workspace/platform/resources";
import AppShell from "@workspace/platform/ui/AppShell";
import { ProjectTab } from "@workspace/work/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { WorkUser } from "@workspace/work/types";

function toWorkUser(user: SessionUser): WorkUser {
  return {
    id: user.id,
    name: user.name,
    visibleResourceKeys: user.visibleResourceKeys || [],
    visibleWriteResourceKeys: user.visibleWriteResourceKeys || [],
    isAdmin: user.isSuperAdmin ?? false,
    company: user.company ?? null,
  };
}

export default async function WorkProjectsPage() {
  const user = await requireResourceAccess("work.projects");
  const title = getResourceDef("work.projects")?.name ?? "项目管理";
  return (
    <AppShell
      title={title}
      backHref="/work"
      user={user}
    >
      <ProjectTab user={toWorkUser(user)} />
    </AppShell>
  );
}
