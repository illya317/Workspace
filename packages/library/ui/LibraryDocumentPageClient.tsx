"use client";

import { useState } from "react";

import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

import LibraryDocumentReader from "./components/LibraryDocumentReader";

interface Props {
  documentId: number;
  user: SessionUser;
  canUpdate?: boolean;
  canArchive?: boolean;
  canExport?: boolean;
  canConfigure?: boolean;
  canImport?: boolean;
}

export default function LibraryDocumentPageClient(props: Props) {
  const [dirty, setDirty] = useState(false);
  return renderAppShellPage({
    title: "资料预览",
    backHref: "/library/basic-info",
    user: props.user,
    hasUnsavedChanges: dirty,
    children: <LibraryDocumentReader {...props} onDirtyChange={setDirty} />,
  });
}
