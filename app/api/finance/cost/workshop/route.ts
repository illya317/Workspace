import { NextResponse } from "next/server";
import { withFinanceCostAccess } from "@/lib/with-auth";
import { listWorkshopReports, getWorkshopSummary } from "@workspace/finance/server/cost";

export async function GET(request: Request) {
  return withFinanceCostAccess(async (req) => {
    const { searchParams } = new URL(req.url);
    const params = {
      year: searchParams.has("year") ? parseInt(searchParams.get("year")!) : undefined,
      month: searchParams.has("month") ? parseInt(searchParams.get("month")!) : undefined,
      productName: searchParams.get("productName") ?? undefined,
      sourceFile: searchParams.get("sourceFile") ?? undefined,
      page: searchParams.has("page") ? parseInt(searchParams.get("page")!) : undefined,
      pageSize: searchParams.has("pageSize") ? parseInt(searchParams.get("pageSize")!) : undefined,
    };

    const [list, summary] = await Promise.all([
      listWorkshopReports(params),
      getWorkshopSummary(params),
    ]);

    return NextResponse.json({ success: true, ...list, summary });
  })(request);
}
