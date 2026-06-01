import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { loadBalanceSheetConfig } from "@/server/services/finance/statements/config/load-config";

// GET: 加载某公司某年度报表配置
export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = parseInt(searchParams.get("year") || "", 10);
  if (!companyCode || !year) return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });

  const config = await loadBalanceSheetConfig(companyCode, year);
  return NextResponse.json({ config });
});

// PUT: 批量保存配置行
export const PUT = withFinanceLedgerWrite(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.lines)) return NextResponse.json({ error: "lines 数组为必填" }, { status: 400 });

  const { companyCode, year, lines } = body;
  if (!companyCode || !year) return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });

  for (const line of lines) {
    await prisma.financeStatementLineConfig.update({
      where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "balanceSheet", lineCode: line.lineCode } },
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
