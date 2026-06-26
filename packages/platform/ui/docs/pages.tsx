import { PageSurface } from "@workspace/core/ui";
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
      <PageSurface
        kind="settings"
        contentClassName="py-10"
        blocks={[{
          kind: "section",
          key: "placeholder",
          title,
          subtitle: description,
          blocks: [{ kind: "empty", key: "empty", content: "内容建设中" }],
        }]}
      />
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
