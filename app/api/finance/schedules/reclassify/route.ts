import { NextResponse } from "next/server";
import { withFinanceReportAccess } from "@workspace/platform/server/with-auth";
import { computeReclassification } from "@workspace/finance/server/schedules/reclassify";

export const GET = withFinanceReportAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  if (!companyCode || !year || !month) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  const result = await computeReclassification(companyCode, parseInt(year), parseInt(month));
  return NextResponse.json(result);
});
