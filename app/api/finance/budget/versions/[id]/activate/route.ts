import { NextResponse } from "next/server";
import { withFinanceBudgetWrite } from "@/lib/with-auth";
import { activateBudgetVersion } from "@/server/services/finance/budget/budget-version";

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  const id = parseInt(request.url.split("/").pop() || "");
  if (!id || isNaN(id)) {
    return NextResponse.json({ error: "无效ID" }, { status: 400 });
  }

  const version = await activateBudgetVersion(id);
  return NextResponse.json({ success: true, version });
});
