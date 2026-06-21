import { NextResponse } from "next/server";
import { withFinanceCostAccess } from "@workspace/platform/server/with-auth";
import { costQuerySchema, listCostAnalysis, getCostAnalysisSummary } from "@workspace/finance/server/cost";

export async function GET(request: Request) {
  return withFinanceCostAccess(async (req) => {
    const { searchParams } = new URL(req.url);
    const parsed = costQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    const [list, summary] = await Promise.all([
      listCostAnalysis(parsed.data),
      getCostAnalysisSummary(parsed.data),
    ]);

    return NextResponse.json({ success: true, ...list, summary });
  })(request);
}
