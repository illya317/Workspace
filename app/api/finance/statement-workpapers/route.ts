/** P3 Batch 2: workpaper draft + save API.
 *  PUT 是全量保存：payload 里的 lines 完全替换该底稿的现有行。
 *  不在 payload 中的 lineCode 会被删除。 */
import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite } from "@/lib/with-auth";
import { getOrCreateDraft, saveWorkpaper } from "@workspace/finance/server/statements/workpapers/service";
import {
  saveWorkpaperSchema,
  workpaperQuerySchema,
} from "@workspace/finance/server/statements/workpapers/schemas";

/** GET ?companyCode=&year=&month=&reportType=incomeStatement|cashFlow */
export const GET = withFinanceReportAccess(async (req) => {
  const { searchParams } = new URL(req.url);
  const raw = Object.fromEntries(searchParams.entries());
  if (!raw.companyCode || !raw.year || !raw.month || !raw.reportType) {
    return NextResponse.json({ error: "companyCode, year, month, reportType 为必填" }, { status: 400 });
  }
  const parsed = workpaperQuerySchema.safeParse(raw);
  if (!parsed.success) {
    if (raw.reportType !== "incomeStatement" && raw.reportType !== "cashFlow") {
      return NextResponse.json({ error: "reportType 仅支持 incomeStatement / cashFlow" }, { status: 400 });
    }
    return NextResponse.json({ error: "year, month 无效" }, { status: 400 });
  }
  const result = await getOrCreateDraft(parsed.data);
  return NextResponse.json(result);
});

function formatSaveError(issues: { path: PropertyKey[] }[]) {
  if (issues.some((issue) => issue.path[0] === "lines" && issue.path.length > 1)) {
    return NextResponse.json(
      { error: "每行需包含 lineCode 与有效的 manualAmount / importedAmount（禁止 NaN / Infinity）" },
      { status: 400 },
    );
  }
  if (issues.some((issue) => issue.path[0] === "reportType")) {
    return NextResponse.json({ error: "reportType 仅支持 incomeStatement / cashFlow" }, { status: 400 });
  }
  return NextResponse.json({ error: "companyCode, year, month, reportType, lines 为必填" }, { status: 400 });
}

/** PUT { companyCode, year, month, reportType, note?, lines[] } — 全量保存 */
export const PUT = withFinanceReportWrite(async (req, user) => {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const parsed = saveWorkpaperSchema.safeParse(body);
  if (!parsed.success) {
    return formatSaveError(parsed.error.issues);
  }
  try {
    const result = await saveWorkpaper(parsed.data, user.userId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
});
