"use client";

import { createPageBody, PageSurface, createStatusSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";

interface Props {
  error: string | null;
  isStale?: boolean;
  hasFlaggedWithoutComment: boolean;
}

export default function ReviewAlerts({ error, isStale, hasFlaggedWithoutComment }: Props) {
  const sections: BodySurfaceSectionSpec[] = [
    ...(error ? [createStatusSection("review-error", { kind: "error", content: error })] : []),
    ...(isStale ? [createStatusSection("review-stale", { kind: "empty", content: "底稿已更新，当前校对为旧快照；请点击「重新生成校对」更新校对。" })] : []),
    ...(hasFlaggedWithoutComment ? [createStatusSection("review-flagged-without-comment", { kind: "empty", content: "存在已标记(flagged)但未填写备注的行，请点击备注列填写标记原因。" })] : []),
  ];

  if (sections.length === 0) return null;
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}
