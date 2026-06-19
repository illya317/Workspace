/** P3 Batch 3: review GET (read) + POST (generate from workpaper). */
import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite } from "@/lib/with-auth";
import { generateReview, getReview } from "@workspace/finance/server/statements/reviews/service";

function extractStatus(e: unknown): number {
  if (e instanceof Error && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number") {
    return (e as { statusCode: number }).statusCode;
  }
  return 400;
}

/** GET ?workpaperId= or ?companyCode=&year=&month=&reportType= */
export const GET = withFinanceReportAccess(async (req) => {
  const { searchParams } = new URL(req.url);
  const workpaperId = searchParams.get("workpaperId");
  if (workpaperId) {
    const id = parseInt(workpaperId, 10);
    if (isNaN(id)) return NextResponse.json({ error: "workpaperId 必须为数字" }, { status: 400 });
    const r = await getReview({ workpaperId: id });
    return NextResponse.json({ review: r });
  }
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const reportType = searchParams.get("reportType");
  if (!companyCode || !year || !month || !reportType) {
    return NextResponse.json({ error: "workpaperId 或 (companyCode, year, month, reportType) 为必填" }, { status: 400 });
  }
  const y = parseInt(year, 10), m = parseInt(month, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    return NextResponse.json({ error: "year, month 无效" }, { status: 400 });
  }
  if (reportType !== "incomeStatement" && reportType !== "cashFlow") {
    return NextResponse.json({ error: "reportType 仅支持 incomeStatement / cashFlow" }, { status: 400 });
  }
  const r = await getReview({ companyCode, year: y, month: m, reportType });
  return NextResponse.json({ review: r });
});

/** POST { workpaperId } — generate review from workpaper. 201=created, 200=existing draft. */
export const POST = withFinanceReportWrite(async (req, user) => {
  let body: { workpaperId?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  if (!body.workpaperId || typeof body.workpaperId !== "number") {
    return NextResponse.json({ error: "workpaperId 为必填" }, { status: 400 });
  }
  try {
    const { review, created } = await generateReview(body.workpaperId, user.userId);
    return NextResponse.json({ review }, { status: created ? 201 : 200 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "生成校对失败" }, { status: extractStatus(e) });
  }
});
