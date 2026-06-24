import AppShell from "@workspace/platform/ui/AppShell";
import type { SessionUser } from "@workspace/platform/types";
import WorksClient from "./WorksClient";
import type { WorkTarget } from "./types";

export function WorkTasksPageView({
  user,
  initialTarget,
}: {
  user: SessionUser;
  initialTarget: WorkTarget;
}) {
  return (
    <AppShell title="工作计划" backHref="/work" user={user}>
      <WorksClient user={user} initialTarget={initialTarget} />
    </AppShell>
  );
}
