import { NextResponse } from "next/server";
import { withFinanceCostAccess } from "@/lib/with-auth";
import { costQuerySchema, getCostSummary } from "@workspace/finance/server/cost";

export async function GET(request: Request) {
  return withFinanceCostAccess(async (req) => {
    const { searchParams } = new URL(req.url);
    const parsed = costQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    const summary = await getCostSummary(parsed.data);
    return NextResponse.json({ success: true, data: summary });
  })(request);
}
