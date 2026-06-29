"use client";

import { createPageBody, createSectionSection, createStatusSection, PageSurface } from "@workspace/core/ui";

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
          sections: [createStatusSection("empty", { kind: "empty", content: empty })],
        }),
      ])}
    />
  );
}
