"use client";

import DocumentsTab from "./components/DocumentsTab";

interface Props {
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
}

export default function LibraryClient({ canWrite, canDelete, canAdmin }: Props) {
  return (
    <DocumentsTab
      canWrite={canWrite}
      canDelete={canDelete}
      canAdmin={canAdmin}
    />
  );
}
