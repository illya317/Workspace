"use client";

import Link from "next/link";

/** User-friendly diagnostic → action guidance (P3 Batch 8). */
const DIAG_MESSAGES: Record<string, string> = {
  missingConfirmedReview: "当前期间尚未确认校对，请先在「报表校对」页生成并确认校对。",
  staleConfirmedReview: "底稿已更新，当前校对快照已过期，请重新生成校对并确认。",
};

export default function ReportBanner({
  source, diagnostics, reviewHref,
}: {
  source?: string;
  diagnostics?: { type: string; message: string }[];
  reviewHref: string;
}) {
  if (source === "review") {
    return (
      <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        ✅ 校对已确认，当前报表来自已确认校对结果。
      </div>
    );
  }
  if (source && source !== "review" && diagnostics?.length) {
    const diag = diagnostics.find((d) => d.type in DIAG_MESSAGES) || diagnostics[0];
    return (
      <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <p className="mb-1.5">⚠ {DIAG_MESSAGES[diag.type] || diag.message}</p>
        <Link href={reviewHref} className="inline-flex items-center gap-1 text-amber-700 underline hover:text-amber-900">
          去报表校对 →
        </Link>
      </div>
    );
  }
  return null;
}
