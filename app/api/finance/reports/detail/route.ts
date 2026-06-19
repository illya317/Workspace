import { NextResponse } from "next/server";
import { withFinanceReportAccess } from "@workspace/platform/server/with-auth";
import { getReportDetail } from "@workspace/finance/server/statements/report-detail";

export const GET = withFinanceReportAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const codes = searchParams.get("codes");

  if (!companyCode || !year || !month || !codes) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  const codeList = codes.split(/[,+]/).map((c) => c.trim()).filter(Boolean);
  const result = await getReportDetail({
    companyCode,
    year: parseInt(year),
    month: parseInt(month),
    codes: codeList,
  });

  return NextResponse.json(result);
});
