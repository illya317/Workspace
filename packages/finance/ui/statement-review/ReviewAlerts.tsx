"use client";

import { createPageBody, PageSurface, createRecordSection } from "@workspace/core/ui";
import type { PageSurfaceSectionSpec } from "@workspace/core/ui";

interface Props {
  error: string | null;
  isStale?: boolean;
  hasFlaggedWithoutComment: boolean;
}

export default function ReviewAlerts({ error, isStale, hasFlaggedWithoutComment }: Props) {
  const sections: PageSurfaceSectionSpec[] = [
    ...(error ? [createRecordSection("review-error", { records: [], empty: error })] : []),
    ...(isStale ? [createRecordSection("review-stale", { records: [], empty: "底稿已更新，当前校对为旧快照；请点击「重新生成校对」更新校对。" })] : []),
    ...(hasFlaggedWithoutComment ? [createRecordSection("review-flagged-without-comment", { records: [], empty: "存在已标记(flagged)但未填写备注的行，请点击备注列填写标记原因。" })] : []),
  ];

  if (sections.length === 0) return null;
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}
