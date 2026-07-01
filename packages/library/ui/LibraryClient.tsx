"use client";

import DocumentsTab from "./components/DocumentsTab";

interface Props {
  canWrite?: boolean;
  canArchive?: boolean;
  canImport?: boolean;
  canExport?: boolean;
  canAdmin?: boolean;
}

export default function LibraryClient({ canWrite, canArchive, canImport, canExport, canAdmin }: Props) {
  return (
    <DocumentsTab
      canWrite={canWrite}
      canArchive={canArchive}
      canImport={canImport}
      canExport={canExport}
      canAdmin={canAdmin}
    />
  );
}
