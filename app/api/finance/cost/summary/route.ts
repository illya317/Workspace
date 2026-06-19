import { NextResponse } from "next/server";
import { withFinanceCostAccess } from "@/lib/with-auth";
import { getCostSummary } from "@workspace/finance/server/cost";

export async function GET(request: Request) {
  return withFinanceCostAccess(async (req) => {
    const { searchParams } = new URL(req.url);
    const params = {
      year: searchParams.has("year") ? parseInt(searchParams.get("year")!) : undefined,
      month: searchParams.has("month") ? parseInt(searchParams.get("month")!) : undefined,
      productName: searchParams.get("productName") ?? undefined,
      customerName: searchParams.get("customerName") ?? undefined,
      sourceFile: searchParams.get("sourceFile") ?? undefined,
    };

    const summary = await getCostSummary(params);
    return NextResponse.json({ success: true, data: summary });
  })(request);
}
