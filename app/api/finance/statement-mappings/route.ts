import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceReportWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { clearMappingCache } from "@/server/services/finance/statements/mapping/resolver";
import { ensureStatementMappings } from "@/server/services/finance/statements/mapping/seed-from-config";

const VALID_TYPES = ["balance"];

// GET: 列出所有映射（反向视图用）
export const GET = withFinanceReportAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = parseInt(searchParams.get("year") || "", 10);
  const statementType = searchParams.get("statementType") || "balance";

  if (!companyCode || !year)
    return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });
  if (!VALID_TYPES.includes(statementType))
    return NextResponse.json({ error: "statementType 暂只支持 balance" }, { status: 400 });

  // Ensure mappings exist before read (avoid race with statement-config init)
  await ensureStatementMappings(companyCode, year, statementType);

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
    return NextResponse.json({ error: "statementType 暂只支持 balance" }, { status: 400 });

  // Validate lineCode exists
  const line = await prisma.financeStatementLineConfig.findUnique({
    where: { companyCode_year_reportType_lineCode: { companyCode, year: yearNum, reportType: "balanceSheet", lineCode } },
  });
  if (!line) return NextResponse.json({ error: "lineCode 不存在" }, { status: 400 });

  // Validate accountCode exists for this company+year
  const account = await prisma.financeAccount.findUnique({
    where: { code_companyCode_year: { code: accountCode, companyCode, year: yearNum } },
  });
  if (!account) return NextResponse.json({ error: "accountCode 不存在" }, { status: 400 });

  const mapping = await prisma.financeStatementAccountMapping.upsert({
    where: {
      companyCode_year_statementType_accountCode: {
        companyCode, year: yearNum, statementType, accountCode,
      },
    },
    create: { companyCode, year: yearNum, statementType, accountCode, lineCode, source: "manual" },
    update: { lineCode, source: "manual", note: null },
  });

  clearMappingCache();

  return NextResponse.json({ success: true, mapping });
});

// DELETE: 清除映射（回到父级继承，幂等）
export const DELETE = withFinanceReportWrite(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = parseInt(searchParams.get("year") || "", 10);
  const statementType = searchParams.get("statementType") || "balance";
  const accountCode = searchParams.get("accountCode");

  if (!companyCode || !year || !accountCode)
    return NextResponse.json({ error: "companyCode, year, accountCode 为必填" }, { status: 400 });
  if (!VALID_TYPES.includes(statementType))
    return NextResponse.json({ error: "statementType 暂只支持 balance" }, { status: 400 });

  const result = await prisma.financeStatementAccountMapping.deleteMany({
    where: { companyCode, year, statementType, accountCode },
  });

  clearMappingCache();

  return NextResponse.json({ success: true, deleted: result.count });
});
