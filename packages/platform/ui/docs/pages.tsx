import { createBlockSurfaceBlock, createPageBody, createSectionBlock, PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";
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
  return renderAppShellPage({
    title,
    backHref: "/docs",
    user,
    children: <PageSurface
      kind="settings"
      contentClassName="py-10"
      body={createPageBody([createSectionBlock("placeholder", {
        title,
        subtitle: description,
        blocks: [createBlockSurfaceBlock("empty", {
          kind: "empty",
          content: "内容建设中"
        })],
      })])}
    />,
  });
}

export function DocsPositionsPage({ user }: { user: SessionUser }) {
  return renderAppShellPage({
    title: "岗位说明书",
    backHref: "/docs",
    user,
    children: <PositionsClient hideShell />,
  });
}

export function DocsPositionDetailPage({ code, user }: { code: string; user: SessionUser }) {
  return renderAppShellPage({
    title: "岗位说明书",
    backHref: "/docs/positions",
    user,
    children: <PositionDetailClient code={code} />,
  });
}
