"use client";

import { createPageBody, PageSurface, createPageDataBlock } from "@workspace/core/ui";
import type { PageSurfaceBlockSpec } from "@workspace/core/ui";

interface Props {
  error: string | null;
  isStale?: boolean;
  hasFlaggedWithoutComment: boolean;
}

export default function ReviewAlerts({ error, isStale, hasFlaggedWithoutComment }: Props) {
  const blocks: PageSurfaceBlockSpec[] = [
    ...(error ? [createPageDataBlock("review-error", { kind: "records", records: [], empty: error })] : []),
    ...(isStale ? [createPageDataBlock("review-stale", { kind: "records", records: [], empty: "底稿已更新，当前校对为旧快照；请点击「重新生成校对」更新校对。" })] : []),
    ...(hasFlaggedWithoutComment ? [createPageDataBlock("review-flagged-without-comment", { kind: "records", records: [], empty: "存在已标记(flagged)但未填写备注的行，请点击备注列填写标记原因。" })] : []),
  ];

  if (blocks.length === 0) return null;
  return <PageSurface kind="list" embedded body={createPageBody(blocks)} />;
}
