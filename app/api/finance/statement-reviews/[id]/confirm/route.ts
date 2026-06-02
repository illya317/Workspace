/** P3 Batch 3: POST /api/finance/statement-reviews/[id]/confirm — confirm review. */
import { NextResponse } from "next/server";
import { withFinanceReportWrite } from "@/lib/with-auth";
import { confirmReview } from "@/server/services/finance/statements/reviews/service";

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceReportWrite(async (_req, user) => {
    const { id } = await params;
    const reviewId = parseInt(id, 10);
    if (isNaN(reviewId)) return NextResponse.json({ error: "id 必须为数字" }, { status: 400 });
    try {
      const review = await confirmReview(reviewId, user.userId);
      return NextResponse.json({ review });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "确认校对失败";
      const is409 = e instanceof Error && "statusCode" in e && (e as { statusCode: unknown }).statusCode === 409;
      return NextResponse.json({ error: msg }, { status: is409 ? 409 : 400 });
    }
  })(req);
}
