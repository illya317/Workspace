"use client";

import DocumentsTab from "./components/DocumentsTab";

interface Props {
  canUpdate?: boolean;
  canArchive?: boolean;
  canImport?: boolean;
  canExport?: boolean;
  canConfigure?: boolean;
}

export default function LibraryClient({ canUpdate, canArchive, canImport, canExport, canConfigure }: Props) {
  return (
    <DocumentsTab
      canUpdate={canUpdate}
      canArchive={canArchive}
      canImport={canImport}
      canExport={canExport}
      canConfigure={canConfigure}
    />
  );
}
