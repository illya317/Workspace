/** P3 Batch 3: review GET (read) + POST (generate from workpaper). */
import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite } from "@/lib/with-auth";
import { generateReview, getReview } from "@/server/services/finance/statements/reviews/service";

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
  const r = await getReview({ companyCode, year: y, month: m, reportType });
  return NextResponse.json({ review: r });
});

/** POST { workpaperId } — generate review from workpaper */
export const POST = withFinanceReportWrite(async (req, user) => {
  let body: { workpaperId?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  if (!body.workpaperId || typeof body.workpaperId !== "number") {
    return NextResponse.json({ error: "workpaperId 为必填" }, { status: 400 });
  }
  try {
    const review = await generateReview(body.workpaperId, user.userId);
    return NextResponse.json({ review }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "生成校对失败";
    const is409 = e instanceof Error && "statusCode" in e && (e as { statusCode: unknown }).statusCode === 409;
    return NextResponse.json({ error: msg }, { status: is409 ? 409 : 400 });
  }
});
