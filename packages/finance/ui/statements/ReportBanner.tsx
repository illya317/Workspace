"use client";

import { createMessageSection, type BodySurfaceSectionSpec } from "@workspace/core/ui";

const DIAG_MESSAGES: Record<string, string> = {
  missingWorkpaper: "当前期间没有现金流量表底稿数据。",
};

type ReportBannerProps = {
  source?: string;
  diagnostics?: { type: string; message: string }[];
};

export function createReportBannerSection(key: string, props: ReportBannerProps): BodySurfaceSectionSpec | null {
  const { source, diagnostics } = props;
  if (source === "workpaper") {
    return createMessageSection(key, {
      tone: "success",

      content: "当前报表来自已导入的法定财务报表底稿。",
    });
  }
  if (source === "empty" && diagnostics?.length) {
    const diag = diagnostics.find((item) => item.type in DIAG_MESSAGES) || diagnostics[0];
    return createMessageSection(key, {
      tone: "warning",

      content: DIAG_MESSAGES[diag.type] || diag.message,
    });
  }
  return null;
}

export default function ReportBanner(props: ReportBannerProps) {
  const block = createReportBannerSection("report-banner", props);
  if (!block || block.body.kind !== "section" || !block.body.message) return null;
  return <div>{block.body.message.content}</div>;
}
