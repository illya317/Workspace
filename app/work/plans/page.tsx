import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import { WorkPlanTab } from "@workspace/work/ui";
import type { SessionUser } from "@/lib/types";
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
      <WorkPlanTab user={toWorkUser(user)} />
    </AppShell>
  );
}
