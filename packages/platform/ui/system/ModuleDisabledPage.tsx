import { EmptyStateCard, ModuleGridPage } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import AppShell from "../AppShell";

type Props = {
  reason: string;
  resourceKey?: string;
  user: SessionUser;
};

export function ModuleDisabledPageView({ reason, resourceKey, user }: Props) {
  return (
    <AppShell title="模块未启用" backHref="/portal" user={user}>
      <ModuleGridPage title="模块未启用" summary={resourceKey ? `资源：${resourceKey}` : undefined} centered>
        <div className="col-span-full">
          <EmptyStateCard>{reason}</EmptyStateCard>
        </div>
      </ModuleGridPage>
    </AppShell>
  );
}
