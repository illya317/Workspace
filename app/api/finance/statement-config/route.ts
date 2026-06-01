import { NextResponse } from "next/server";
import { withFinanceReportAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { getStatementConfigView } from "@/server/services/finance/statements/statement-config-view";

// GET: 报表配置视图（lineConfigs + accountTree + mappingPreview）
// 权限：finance.statement access
export const GET = withFinanceReportAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = parseInt(searchParams.get("year") || "", 10);
  if (!companyCode || !year)
    return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });

  const type = searchParams.get("type") || "balance";
  if (!["balance", "income", "cashflow"].includes(type))
    return NextResponse.json({ error: "type 仅支持 balance/income/cashflow" }, { status: 400 });

  const view = await getStatementConfigView(companyCode, year, type);
  return NextResponse.json(view);
});

// PUT: 批量保存配置行（unchanged from before M5）
// 权限：finance.ledger write（写操作走 ledger 口径）
export const PUT = withFinanceLedgerWrite(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.lines))
    return NextResponse.json({ error: "lines 数组为必填" }, { status: 400 });

  const { companyCode, year, lines } = body;
  if (!companyCode || !year)
    return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });

  for (const line of lines) {
    await prisma.financeStatementLineConfig.update({
      where: {
        companyCode_year_reportType_lineCode: {
          companyCode, year, reportType: "balanceSheet", lineCode: line.lineCode,
        },
      },
      data: {
        prefixesJson: JSON.stringify(line.prefixes || []),
        subtractPrefixesJson: JSON.stringify(line.subtractPrefixes || []),
        reclassSource: line.reclassSource ?? undefined,
        reclassTarget: line.reclassTarget ?? undefined,
        label: line.label ?? undefined,
        section: line.section ?? undefined,
        enabled: line.enabled ?? undefined,
      },
    });
  }

  return NextResponse.json({ success: true, updated: lines.length });
});
