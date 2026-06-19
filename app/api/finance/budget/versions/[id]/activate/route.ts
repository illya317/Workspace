import { NextResponse } from "next/server";
import { withFinanceBudgetWrite } from "@/lib/with-auth";
import { activateBudgetVersion } from "@workspace/finance/server/budget/budget-version";
import { budgetVersionIdSchema } from "@workspace/finance/server/budget/schemas";

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  // URL: .../versions/{id}/activate → 取倒数第二段
  const segments = request.url.split("/");
  const parsed = budgetVersionIdSchema.safeParse({ id: segments[segments.length - 2] });
  if (!parsed.success) {
    return NextResponse.json({ error: "无效ID" }, { status: 400 });
  }

  const version = await activateBudgetVersion(parsed.data.id);
  return NextResponse.json({ success: true, version });
});
