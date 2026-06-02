/** P3 Batch 2: workpaper draft + save API.
 *  PUT 是全量保存：payload 里的 lines 完全替换该底稿的现有行。
 *  不在 payload 中的 lineCode 会被删除。 */
import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite } from "@/lib/with-auth";
import { getOrCreateDraft, saveWorkpaper } from "@/server/services/finance/statements/workpapers/service";
import type { SaveWorkpaperInput } from "@/server/services/finance/statements/workpapers/types";

function validateYearMonth(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return "year, month 必须为整数";
  if (year < 2000 || year > 2100) return "year 超出范围 (2000-2100)";
  if (month < 1 || month > 12) return "month 必须为 1-12";
  return null;
}

function validateAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

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
  const y = Number(year), m = Number(month);
  const err = validateYearMonth(y, m);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (reportType !== "incomeStatement" && reportType !== "cashFlow") {
    return NextResponse.json({ error: "reportType 仅支持 incomeStatement / cashFlow" }, { status: 400 });
  }
  const result = await getOrCreateDraft({ companyCode, year: y, month: m, reportType });
  return NextResponse.json(result);
});

/** PUT { companyCode, year, month, reportType, note?, lines[] } — 全量保存 */
export const PUT = withFinanceReportWrite(async (req, user) => {
  let body: SaveWorkpaperInput;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const { companyCode, year, month, reportType, lines } = body;
  if (!companyCode || year == null || month == null || !reportType || !lines || !Array.isArray(lines)) {
    return NextResponse.json({ error: "companyCode, year, month, reportType, lines 为必填" }, { status: 400 });
  }
  const err = validateYearMonth(year, month);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (reportType !== "incomeStatement" && reportType !== "cashFlow") {
    return NextResponse.json({ error: "reportType 仅支持 incomeStatement / cashFlow" }, { status: 400 });
  }
  for (const l of lines) {
    if (!l.lineCode || !validateAmount(l.manualAmount) || !validateAmount(l.importedAmount)) {
      return NextResponse.json({ error: "每行需包含 lineCode 与有效的 manualAmount / importedAmount（禁止 NaN / Infinity）" }, { status: 400 });
    }
  }
  try {
    const result = await saveWorkpaper(body, user.userId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
});
