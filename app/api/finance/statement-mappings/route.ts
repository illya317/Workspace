import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite, withFinanceReportDelete } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { clearMappingCache } from "@/server/services/finance/statements/mapping/resolver";

const VALID_TYPES = ["balance", "income", "cashflow"];

// GET: 列出所有映射（反向视图用）
export const GET = withFinanceReportAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = parseInt(searchParams.get("year") || "", 10);
  const statementType = searchParams.get("statementType") || "balance";

  if (!companyCode || !year)
    return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });
  if (!VALID_TYPES.includes(statementType))
    return NextResponse.json({ error: "statementType 仅支持 balance/income/cashflow" }, { status: 400 });

  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true, source: true, note: true },
    orderBy: { lineCode: "asc" },
  });

  return NextResponse.json({ mappings });
});

// POST: upsert 映射（科目 → 报表项目）
export const POST = withFinanceReportWrite(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "请求体为必填" }, { status: 400 });

  const { companyCode, year, statementType, accountCode, lineCode } = body;
  if (!companyCode || !year || !statementType || !accountCode || !lineCode)
    return NextResponse.json(
      { error: "companyCode, year, statementType, accountCode, lineCode 为必填" },
      { status: 400 },
    );

  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) return NextResponse.json({ error: "year 必须为数字" }, { status: 400 });
  if (!VALID_TYPES.includes(statementType))
    return NextResponse.json({ error: "statementType 仅支持 balance/income/cashflow" }, { status: 400 });

  const mapping = await prisma.financeStatementAccountMapping.upsert({
    where: {
      companyCode_year_statementType_accountCode: {
        companyCode, year: yearNum, statementType, accountCode,
      },
    },
    create: { companyCode, year: yearNum, statementType, accountCode, lineCode, source: "manual" },
    update: { lineCode, source: "manual" },
  });

  clearMappingCache();

  return NextResponse.json({ success: true, mapping });
});

// DELETE: 移除映射
export const DELETE = withFinanceReportDelete(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = parseInt(searchParams.get("year") || "", 10);
  const statementType = searchParams.get("statementType") || "balance";
  const accountCode = searchParams.get("accountCode");

  if (!companyCode || !year || !accountCode)
    return NextResponse.json({ error: "companyCode, year, accountCode 为必填" }, { status: 400 });
  if (!VALID_TYPES.includes(statementType))
    return NextResponse.json({ error: "statementType 仅支持 balance/income/cashflow" }, { status: 400 });

  await prisma.financeStatementAccountMapping.delete({
    where: {
      companyCode_year_statementType_accountCode: {
        companyCode, year, statementType, accountCode,
      },
    },
  });

  clearMappingCache();

  return NextResponse.json({ success: true });
});
