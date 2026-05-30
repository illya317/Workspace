import { NextResponse } from "next/server";
import { withFinanceBudgetWrite } from "@/lib/with-auth";
import { activateBudgetVersion } from "@/server/services/finance/budget/budget-version";

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  // URL: .../versions/{id}/activate → 取倒数第二段
  const segments = request.url.split("/");
  const id = parseInt(segments[segments.length - 2] || "");
  if (!id || isNaN(id)) {
    return NextResponse.json({ error: "无效ID" }, { status: 400 });
  }

  const version = await activateBudgetVersion(id);
  return NextResponse.json({ success: true, version });
});
