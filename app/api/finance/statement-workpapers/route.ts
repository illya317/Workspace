/** P3 Batch 2: workpaper draft + save API. */
import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite } from "@/lib/with-auth";
import { getOrCreateDraft, saveWorkpaper } from "@/server/services/finance/statements/workpapers/service";
import type { SaveWorkpaperInput } from "@/server/services/finance/statements/workpapers/types";

/** GET ?companyCode=&year=&month=&reportType=incomeStatement|cashFlow */
export const GET = withFinanceReportAccess(async (req) => {
  const { searchParams } = new URL(req.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const reportType = searchParams.get("reportType");
  if (!companyCode || !year || !month || !reportType) {
    return NextResponse.json({ error: "companyCode, year, month, reportType 为必填" }, { status: 400 });
  }
  const y = parseInt(year), m = parseInt(month);
  if (isNaN(y) || isNaN(m)) {
    return NextResponse.json({ error: "year, month 必须为数字" }, { status: 400 });
  }
  if (reportType !== "incomeStatement" && reportType !== "cashFlow") {
    return NextResponse.json({ error: "reportType 仅支持 incomeStatement / cashFlow" }, { status: 400 });
  }
  const result = await getOrCreateDraft({ companyCode, year: y, month: m, reportType });
  return NextResponse.json(result);
});

/** PUT { companyCode, year, month, reportType, note?, lines } */
export const PUT = withFinanceReportWrite(async (req, user) => {
  let body: SaveWorkpaperInput;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const { companyCode, year, month, reportType, lines } = body;
  if (!companyCode || year == null || month == null || !reportType || !lines || !Array.isArray(lines)) {
    return NextResponse.json({ error: "companyCode, year, month, reportType, lines 为必填" }, { status: 400 });
  }
  if (reportType !== "incomeStatement" && reportType !== "cashFlow") {
    return NextResponse.json({ error: "reportType 仅支持 incomeStatement / cashFlow" }, { status: 400 });
  }
  for (const l of lines) {
    if (!l.lineCode || typeof l.manualAmount !== "number" || typeof l.importedAmount !== "number") {
      return NextResponse.json({ error: "每行需包含 lineCode, manualAmount, importedAmount" }, { status: 400 });
    }
  }
  try {
    const result = await saveWorkpaper(body, user.userId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "保存失败" }, { status: 400 });
  }
});
