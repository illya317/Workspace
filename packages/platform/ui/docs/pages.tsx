import { EmptyStateCard, ModuleGridPage } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import AppShell from "../AppShell";
import ModuleCard from "../ModuleCard";
import ApiGuideClient from "./ApiGuideClient";
import GmpPositionDetailClient from "./positions/gmp/GmpPositionDetailClient";
import GmpPositionsClient from "./positions/gmp/GmpPositionsClient";

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

export function DocsPositionsIndex({ user }: { user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <ModuleGridPage title="岗位说明书" summary="GMP 体系岗位说明书" centered>
        <ModuleCard
          title="GMP 岗位说明书"
          description="GMP 体系岗位说明书"
          color="purple"
          href="/docs/positions/GMP"
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.75c-1.8-1.1-4.05-1.75-6.5-1.75v12c2.45 0 4.7.65 6.5 1.75m0-12c1.8-1.1 4.05-1.75 6.5-1.75v12c-2.45 0-4.7.65-6.5 1.75m0-12v12" />
            </svg>
          }
        />
      </ModuleGridPage>
    </AppShell>
  );
}

export function DocsApiGuidePage({ user }: { user: SessionUser }) {
  return (
    <AppShell title="接入指南" backHref="/docs" user={user}>
      <ApiGuideClient hideShell initialUser={user} />
    </AppShell>
  );
}

export function GmpPositionsPage({ user }: { user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <GmpPositionsClient hideShell />
    </AppShell>
  );
}

export function GmpPositionDetailPage({ code, user }: { code: string; user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs/positions/GMP" user={user}>
      <GmpPositionDetailClient code={code} />
    </AppShell>
  );
}
