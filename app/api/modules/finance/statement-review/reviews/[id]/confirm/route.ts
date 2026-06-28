/** P3 Batch 3: POST /api/modules/finance/statement-review/reviews/[id]/confirm — confirm review. */
import { NextResponse } from "next/server";
import { withFinanceStatementReviewWrite } from "@workspace/platform/server/with-auth";
import { confirmReview } from "@workspace/finance/server/statements/reviews/service";
import { reviewIdSchema } from "@workspace/finance/server/statements/reviews/schemas";
import { jsonErrorResponse } from "@workspace/platform/server/api";

function statusFrom(e: unknown): number {
  if (e instanceof Error && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number") {
    return (e as { statusCode: number }).statusCode;
  }
  return 400;
}

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceStatementReviewWrite(async (_req, user) => {
    const parsedParams = reviewIdSchema.safeParse(await params);
    if (!parsedParams.success) return jsonErrorResponse("id 必须为数字", 400);
    try {
      const review = await confirmReview(parsedParams.data.id, user.userId);
      return NextResponse.json({ review });
    } catch (e: unknown) {
      return jsonErrorResponse(e instanceof Error ? e.message : "确认校对失败", statusFrom(e));
    }
  })(req);
}
