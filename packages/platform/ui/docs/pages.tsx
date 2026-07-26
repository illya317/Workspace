import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";
import DocsEditorWorkbench from "./editor/DocsEditorWorkbench";
import CompanyDocumentsClient from "./CompanyDocumentsClient";
import type { CompanyDocumentItem } from "../../company-documents";

export function DocsCompanyPage({ user, documents }: { user: SessionUser; documents: CompanyDocumentItem[] }) {
  return <CompanyDocumentsClient user={user} documents={documents} />;
}

export function DocsEditorPage({ user }: { user: SessionUser }) {
  return renderAppShellPage({
    title: "模板编辑器",
    backHref: "/docs",
    user,
    children: <DocsEditorWorkbench currentUserId={user.id} />,
  });
}

export function DocsEditorTemplateDetailPage({ templateId, user }: { templateId: string; user: SessionUser }) {
  return renderAppShellPage({
    title: "模板编辑器",
    backHref: "/docs/editor",
    user,
    children: <DocsEditorWorkbench currentUserId={user.id} initialTemplateId={templateId} />,
  });
}
