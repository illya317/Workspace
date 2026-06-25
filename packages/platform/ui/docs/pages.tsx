import { EmptyStateCard, ModuleGridPage } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import AppShell from "../AppShell";
import PositionDetailClient from "./positions/PositionDetailClient";
import PositionsClient from "./positions/PositionsClient";

export function DocsPlaceholderPage({
  user,
  title,
  description,
}: {
  user: SessionUser;
  title: string;
  description: string;
}) {
  return (
    <AppShell title={title} backHref="/docs" user={user}>
      <ModuleGridPage title={title} summary={description} centered>
        <div className="col-span-full">
          <EmptyStateCard compact={false}>内容建设中</EmptyStateCard>
        </div>
      </ModuleGridPage>
    </AppShell>
  );
}

export function DocsPositionsPage({ user }: { user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <PositionsClient hideShell />
    </AppShell>
  );
}

export function DocsPositionDetailPage({ code, user }: { code: string; user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs/positions" user={user}>
      <PositionDetailClient code={code} />
    </AppShell>
  );
}
