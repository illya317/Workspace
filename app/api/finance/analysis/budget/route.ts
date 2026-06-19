import { NextResponse } from "next/server";
import { withFinanceAnalysisAccess } from "@workspace/platform/server/with-auth";
import { getBudgetAnalysis } from "@workspace/finance/server/analysis/budget-analysis";

export const GET = withFinanceAnalysisAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2026");
  const companyCode = searchParams.get("companyCode") || undefined;
  const result = await getBudgetAnalysis(year, companyCode);
  return NextResponse.json(result);
});
