import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { scanCandidates } from "@/server/services/finance/ledger/reclass-rules";

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

  const result = await scanCandidates({
    companyCode,
    year: parseInt(year),
  });

  return NextResponse.json(result);
});

// ─── PUT: 创建或更新规则 ──────────────────────────────────

const PUT_BODY_KEYS = [
  "companyCode",
  "year",
  "sourceAccountCode",
  "abnormalSide",
  "targetAccountCode",
  "enabled",
  "note",
] as const;

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

  if (!["debit", "credit"].includes(abnormalSide)) {
    return NextResponse.json(
      { error: "abnormalSide 必须为 debit 或 credit" },
      { status: 400 },
    );
  }

  // Upsert by unique key
  const rule = await prisma.financeReclassRule.upsert({
    where: {
      companyCode_year_sourceAccountCode_abnormalSide: {
        companyCode,
        year: parseInt(year),
        sourceAccountCode,
        abnormalSide,
      },
    },
    create: {
      companyCode,
      year: parseInt(year),
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

  return NextResponse.json({ success: true, rule });
});
