import { createElement } from "react";
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
  return createElement(
    AppShell,
    { title, backHref: "/docs", user },
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
    />,
  );
}

export function DocsPositionsPage({ user }: { user: SessionUser }) {
  return createElement(
    AppShell,
    { title: "岗位说明书", backHref: "/docs", user },
    <PositionsClient hideShell />,
  );
}

export function DocsPositionDetailPage({ code, user }: { code: string; user: SessionUser }) {
  return createElement(
    AppShell,
    { title: "岗位说明书", backHref: "/docs/positions", user },
    <PositionDetailClient code={code} />,
  );
}
