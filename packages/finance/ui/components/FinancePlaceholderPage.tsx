"use client";

import { createPageBody, createRecordSection, createSectionSection, PageSurface } from "@workspace/core/ui";

interface FinancePlaceholderPageProps {
  sectionKey: string;
  title: string;
  subtitle: string;
  empty: string;
}

export default function FinancePlaceholderPage({
  sectionKey,
  title,
  subtitle,
  empty,
}: FinancePlaceholderPageProps) {
  return (
    <PageSurface
      kind="standard"
      body={createPageBody([
        createSectionSection(sectionKey, {
          title,
          subtitle,
          sections: [createRecordSection("empty", { records: [], empty })],
        }),
      ])}
    />
  );
}
