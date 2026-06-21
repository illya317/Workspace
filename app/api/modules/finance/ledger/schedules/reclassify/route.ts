import { NextResponse } from "next/server";
import { authorize } from "@workspace/platform/server/auth";
import { withAuth } from "@workspace/platform/server/with-auth";
import { computeReclassification } from "@workspace/finance/server/schedules/reclassify";

export const GET = withAuth(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  if (!companyCode || !year || !month) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  const result = await computeReclassification(companyCode, parseInt(year), parseInt(month));
  return NextResponse.json(result);
}, (userId) => authorize({ user: userId, resourceKey: "finance.ledger", action: "access" }));
