import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { scanCandidates } from "@workspace/finance/server/ledger/reclass-rules";
import { syncReclassRuleResults } from "@workspace/finance/server/ledger/reclass-rules/sync";
import { ensureReclassRulesForYear } from "@workspace/finance/server/ledger/reclass-rules/ensure";

// ─── GET: 扫描候选 ────────────────────────────────────────

export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");

  if (!companyCode || !year) {
    return NextResponse.json(
      { error: "companyCode 和 year 为必填" },
      { status: 400 },
    );
  }
  const yearNum = parseInt(year);
  if (isNaN(yearNum)) {
    return NextResponse.json({ error: "year 必须为数字" }, { status: 400 });
  }

  // 确保该年度有规则（无则从上年继承）
  await ensureReclassRulesForYear(companyCode, yearNum);

  const result = await scanCandidates({
    companyCode,
    year: yearNum,
  });

  return NextResponse.json(result);
});

// ─── PUT: 创建或更新规则 ──────────────────────────────────

export const PUT = withFinanceLedgerWrite(async (request: Request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体为必填" }, { status: 400 });
  }

  const { companyCode, year, sourceAccountCode, abnormalSide, targetAccountCode } = body;
  if (!companyCode || !year || !sourceAccountCode || !abnormalSide || !targetAccountCode) {
    return NextResponse.json(
      { error: "companyCode, year, sourceAccountCode, abnormalSide, targetAccountCode 为必填" },
      { status: 400 },
    );
  }

  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    return NextResponse.json({ error: "year 必须为数字" }, { status: 400 });
  }

  if (!["debit", "credit", "both"].includes(abnormalSide)) {
    return NextResponse.json(
      { error: "abnormalSide 必须为 debit、credit 或 both" },
      { status: 400 },
    );
  }

  // Upsert by (公司, 年度, 源科目, 借贷方向)
  const rule = await prisma.financeReclassRule.upsert({
    where: {
      companyCode_year_sourceAccountCode_abnormalSide: {
        companyCode,
        year: yearNum,
        sourceAccountCode,
        abnormalSide,
      },
    },
    create: {
      companyCode,
      year: yearNum,
      sourceAccountCode,
      abnormalSide,
      targetAccountCode,
      enabled: body.enabled ?? true,
      note: body.note || null,
      source: "manual",
    },
    update: {
      targetAccountCode,
      enabled: body.enabled ?? undefined,
      note: body.note !== undefined ? (body.note || null) : undefined,
    },
  });

  // 同步该公司该年度所有期间
  const sync = await syncReclassRuleResults(companyCode, yearNum);

  return NextResponse.json({ success: true, rule, sync });
});
