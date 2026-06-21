/** P3 Batch 3: review GET (read) + POST (generate from workpaper). */
import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite } from "@workspace/platform/server/with-auth";
import { generateReview, getReview } from "@workspace/finance/server/statements/reviews/service";
import {
  generateReviewSchema,
  reviewQuerySchema,
} from "@workspace/finance/server/statements/reviews/schemas";

function extractStatus(e: unknown): number {
  if (e instanceof Error && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number") {
    return (e as { statusCode: number }).statusCode;
  }
  return 400;
}

/** GET ?workpaperId= or ?companyCode=&year=&month=&reportType= */
export const GET = withFinanceReportAccess(async (req) => {
  const { searchParams } = new URL(req.url);
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = reviewQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const hasWorkpaper = Boolean(raw.workpaperId);
    return NextResponse.json(
      { error: hasWorkpaper ? "workpaperId 必须为数字" : "workpaperId 或 (companyCode, year, month, reportType) 为必填" },
      { status: 400 },
    );
  }
  if ("workpaperId" in parsed.data) {
    const r = await getReview({ workpaperId: parsed.data.workpaperId });
    return NextResponse.json({ review: r });
  }
  const r = await getReview(parsed.data);
  return NextResponse.json({ review: r });
});

/** POST { workpaperId } — generate review from workpaper. 201=created, 200=existing draft. */
export const POST = withFinanceReportWrite(async (req, user) => {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const parsed = generateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "workpaperId 为必填" }, { status: 400 });
  }
  try {
    const { review, created } = await generateReview(parsed.data.workpaperId, user.userId);
    return NextResponse.json({ review }, { status: created ? 201 : 200 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "生成校对失败" }, { status: extractStatus(e) });
  }
});
