/** P3 Batch 3: PUT /api/finance/statement-reviews/[id] — update review lines (partial). */
import { NextResponse } from "next/server";
import { withFinanceReportWrite } from "@/lib/with-auth";
import { updateReviewLines } from "@/server/services/finance/statements/reviews/service";
import type { ReviewLineInput } from "@/server/services/finance/statements/reviews/types";

function statusFrom(e: unknown): number {
  if (e instanceof Error && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number") {
    return (e as { statusCode: number }).statusCode;
  }
  return 400;
}

export function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceReportWrite(async (_req, user) => {
    const { id } = await params;
    const reviewId = parseInt(id, 10);
    if (isNaN(reviewId)) return NextResponse.json({ error: "id 必须为数字" }, { status: 400 });

    let body: { lines?: ReviewLineInput[]; note?: string | null };
    try { body = await _req.json(); } catch {
      return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
    }
    if (!body.lines || !Array.isArray(body.lines)) {
      return NextResponse.json({ error: "lines 数组为必填" }, { status: 400 });
    }
    for (const l of body.lines) {
      if (!l.lineCode) return NextResponse.json({ error: "每行需包含 lineCode" }, { status: 400 });
    }
    try {
      const review = await updateReviewLines(reviewId, body.lines, body.note, user.userId);
      return NextResponse.json({ review });
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "更新校对失败" }, { status: statusFrom(e) });
    }
  })(req);
}
