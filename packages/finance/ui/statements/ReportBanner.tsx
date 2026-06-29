"use client";

import Link from "next/link";
import { createMessageBlock, type PageSurfaceBlockSpec } from "@workspace/core/ui";

const DIAG_MESSAGES: Record<string, string> = {
  missingConfirmedReview: "当前期间尚未确认校对，请先在「报表校对」页生成并确认校对。",
  staleConfirmedReview: "底稿已更新，当前校对快照已过期，请重新生成校对并确认。",
};

type ReportBannerProps = {
  source?: string;
  diagnostics?: { type: string; message: string }[];
  reviewHref: string;
};

export function createReportBannerBlock(key: string, props: ReportBannerProps): PageSurfaceBlockSpec | null {
  const { source, diagnostics, reviewHref } = props;
  if (source === "review") {
    return createMessageBlock(key, {
      tone: "success",

      content: "校对已确认，当前报表来自已确认校对结果。",
    });
  }
  if (source && source !== "review" && diagnostics?.length) {
    const diag = diagnostics.find((item) => item.type in DIAG_MESSAGES) || diagnostics[0];
    return createMessageBlock(key, {
      tone: "warning",

      content: <>
        <p className="mb-1.5">{DIAG_MESSAGES[diag.type] || diag.message}</p>
        <Link href={reviewHref} className="inline-flex items-center gap-1 text-amber-700 underline hover:text-amber-900">
          去报表校对
        </Link>
      </>,
    });
  }
  return null;
}

export default function ReportBanner(props: ReportBannerProps) {
  const block = createReportBannerBlock("report-banner", props);
  if (!block || block.kind !== "block" || block.surface.kind !== "message") return null;
  return <div>{block.surface.content}</div>;
}
