import { createEmptySection, createPageBody, createSectionSection, PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";
import DocsEditorTemplateDetailClient from "./editor/DocsEditorTemplateDetailClient";
import DocsEditorWorkbench from "./editor/DocsEditorWorkbench";
import PositionDetailClient from "./positions/PositionDetailClient";
import PositionsClient from "./positions/PositionsClient";

export function DocsPlaceholderPage({
  user,
  title,
}: {
  user: SessionUser;
  title: string;
}) {
  return renderAppShellPage({
    title,
    backHref: "/docs",
    user,
    children: <PageSurface kind="standard"
      body={createPageBody([createSectionSection("placeholder", {
        title,
        sections: [createEmptySection("empty", {
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

export function DocsEditorPage({ user }: { user: SessionUser }) {
  return renderAppShellPage({
    title: "模板编辑器",
    backHref: "/docs",
    user,
    children: <DocsEditorWorkbench />,
  });
}

export function DocsEditorTemplateDetailPage({ templateId, user }: { templateId: string; user: SessionUser }) {
  return renderAppShellPage({
    title: "模板编辑器",
    backHref: "/docs/editor",
    user,
    children: <DocsEditorTemplateDetailClient templateId={templateId} />,
  });
}
