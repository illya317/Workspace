import { NextResponse } from "next/server";
import { withAuth } from "@workspace/platform/server/with-auth";
import { computeReclassification } from "@workspace/finance/server/schedules/reclassify";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const GET = withAuth(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  if (!companyCode || !year || !month) {
    return jsonErrorResponse("缺少参数", 400);
  }

  const result = await computeReclassification(companyCode, parseInt(year), parseInt(month));
  return NextResponse.json(result);
});
