/** P3 Batch 3: PUT /api/finance/statement-reviews/[id] — update review lines (partial). */
import { NextResponse } from "next/server";
import { withFinanceReportWrite } from "@/lib/with-auth";
import { updateReviewLines } from "@workspace/finance/server/statements/reviews/service";
import {
  reviewIdSchema,
  updateReviewSchema,
} from "@workspace/finance/server/statements/reviews/schemas";

function statusFrom(e: unknown): number {
  if (e instanceof Error && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number") {
    return (e as { statusCode: number }).statusCode;
  }
  return 400;
}

export function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceReportWrite(async (_req, user) => {
    const parsedParams = reviewIdSchema.safeParse(await params);
    if (!parsedParams.success) return NextResponse.json({ error: "id 必须为数字" }, { status: 400 });

    const body = await _req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
    }
    const parsedBody = updateReviewSchema.safeParse(body);
    if (!parsedBody.success) return NextResponse.json({ error: "lines 数组为必填" }, { status: 400 });

    try {
      const review = await updateReviewLines(
        parsedParams.data.id,
        parsedBody.data.lines,
        parsedBody.data.note,
        user.userId,
      );
      return NextResponse.json({ review });
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "更新校对失败" }, { status: statusFrom(e) });
    }
  })(req);
}
