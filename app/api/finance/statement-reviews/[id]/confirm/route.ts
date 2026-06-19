/** P3 Batch 3: POST /api/finance/statement-reviews/[id]/confirm — confirm review. */
import { NextResponse } from "next/server";
import { withFinanceReportWrite } from "@/lib/with-auth";
import { confirmReview } from "@workspace/finance/server/statements/reviews/service";

function statusFrom(e: unknown): number {
  if (e instanceof Error && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number") {
    return (e as { statusCode: number }).statusCode;
  }
  return 400;
}

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceReportWrite(async (_req, user) => {
    const { id } = await params;
    const reviewId = parseInt(id, 10);
    if (isNaN(reviewId)) return NextResponse.json({ error: "id 必须为数字" }, { status: 400 });
    try {
      const review = await confirmReview(reviewId, user.userId);
      return NextResponse.json({ review });
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "确认校对失败" }, { status: statusFrom(e) });
    }
  })(req);
}
