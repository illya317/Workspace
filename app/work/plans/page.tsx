import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { PageContent } from "@workspace/core/ui";
import { WorkPlanTab } from "@workspace/work/ui";
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

export default async function WorkPlansPage() {
  const user = await requireResourceAccess("work.plan");
  return (
    <AppShell
      title="工作计划"
      backHref="/work"
      user={user}
    >
      <PageContent>
        <WorkPlanTab user={toWorkUser(user)} />
      </PageContent>
    </AppShell>
  );
}
