"use client";

import { useMemo, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import {
  createMasterDetailBody,
  createDocumentSection,
  createEmptySection,
  createPageBody,
  PageSurface,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import { createDocumentWorkspaceSection } from "@workspace/platform/document-editor";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import type { CompanyDocumentItem } from "../company-documents";
import { companyDocumentFromMarkdown } from "./company-document-markdown";

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export default function CompanyDocumentsClient({
  user,
  documents,
}: {
  user: SessionUser;
  documents: CompanyDocumentItem[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(documents[0]?.key ?? null);
  const selected = documents.find((document) => document.key === selectedKey) ?? documents[0] ?? null;
  const paperDocument = useMemo(() => selected?.format === "paper" && selected.markdown
    ? companyDocumentFromMarkdown({ key: selected.key, title: selected.title, markdown: selected.markdown })
    : null, [selected]);

  const selector: SelectorSurfaceProps<CompanyDocumentItem> = {
    kind: "list",
    title: "公司文档",
    selectedId: selected?.key ?? null,
    emptyText: "尚未配置公司文档",
    items: documents.map((document) => ({
      key: document.key,
      value: document,
      group: document.format === "paper" ? "系统治理" : "公司制度",
      card: {
        title: document.title,
        subtitle: document.description,
        code: document.format === "paper" ? "纸质版" : document.fileName.split(".").pop()?.toUpperCase() || "OFFICE",
        meta: [`更新 ${dateLabel(document.updatedAt)}`, fileSize(document.fileSizeBytes)],
        status: { label: "只读", tone: "muted" },
        tone: "slate",
      },
    })),
    onSelect: (document) => {
      setSelectedKey(document.key);
    },
  };

  const right = !selected
    ? createPageBody([createEmptySection("company-document-empty", { content: "从左侧选择文档开始阅读", presentation: "card" })])
    : selected.format === "office"
      ? createPageBody([createDocumentSection("company-office-document", {
          kind: "viewer",
          viewer: {
            src: workspacePath(`/api/modules/docs/company/documents/${selected.key}/office-viewer`),
            title: `${selected.title} Office 只读预览`,
          },
        })])
      : createPageBody(paperDocument
          ? [createDocumentWorkspaceSection({ key: "company-paper-document", mode: "preview", document: paperDocument })]
          : [createEmptySection("company-paper-empty", { content: "该文档暂时没有可阅读内容", presentation: "card" })]);

  return renderAppShellPage({
    title: "公司管理",
    backHref: "/docs",
    user,
    children: <PageSurface
      kind="standard"
      body={createMasterDetailBody({
        master: { label: "公司文档", presentation: "compact", body: { kind: "selector", selector } },
        detail: right,
        desktop: { ratio: [1, 3] },
      })}
    />,
  });
}
