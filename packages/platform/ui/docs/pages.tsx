import { createEmptySection, createPageBody, createSectionSection, PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";
import DocsEditorTemplateDetailClient from "./editor/DocsEditorTemplateDetailClient";
import DocsEditorWorkbench from "./editor/DocsEditorWorkbench";

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
