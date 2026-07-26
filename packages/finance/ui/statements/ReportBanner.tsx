"use client";

import { createMessageSection, type BodySurfaceSectionSpec } from "@workspace/core/ui";

const DIAG_MESSAGES: Record<string, string> = {
  missingCashFlowAllocations: "当前期间的系统账没有现金流量分配数据。",
};

type ReportBannerProps = {
  source?: string;
  diagnostics?: { type: string; message: string }[];
};

export function createReportBannerSection(key: string, props: ReportBannerProps): BodySurfaceSectionSpec | null {
  const { source, diagnostics } = props;
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
