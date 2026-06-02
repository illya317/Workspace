/** P3 Batch 3: PUT /api/finance/statement-reviews/[id] — update review lines. */
import { NextResponse } from "next/server";
import { withFinanceReportWrite } from "@/lib/with-auth";
import { updateReviewLines } from "@/server/services/finance/statements/reviews/service";
import type { ReviewLineInput } from "@/server/services/finance/statements/reviews/types";

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
      const msg = e instanceof Error ? e.message : "更新校对失败";
      const is409 = e instanceof Error && "statusCode" in e && (e as { statusCode: unknown }).statusCode === 409;
      return NextResponse.json({ error: msg }, { status: is409 ? 409 : 400 });
    }
  })(req);
}
