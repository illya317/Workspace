"use client";

import { createPageBody, createSectionSection, createStatusSection, PageSurface } from "@workspace/core/ui";

interface FinancePlaceholderPageProps {
  sectionKey: string;
  title: string;
  empty: string;
}

export default function FinancePlaceholderPage({
  sectionKey,
  title,
  empty,
}: FinancePlaceholderPageProps) {
  return (
    <PageSurface
      kind="standard"
      body={createPageBody([
        createSectionSection(sectionKey, {
          title,
          sections: [createStatusSection("empty", { kind: "empty", content: empty })],
        }),
      ])}
    />
  );
}
