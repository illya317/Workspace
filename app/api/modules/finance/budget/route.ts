import { NextResponse } from "next/server";
import { withFinanceBudgetAccess, withFinanceBudgetWrite } from "@workspace/platform/server/with-auth";
import { importBudgetWorkbook, loadBudgetOverview } from "@workspace/finance/server/budget/service";
import {
  budgetQuerySchema,
  createBudgetImportSchema,
} from "@workspace/finance/server/budget/schemas";

export const GET = withFinanceBudgetAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = budgetQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  return NextResponse.json(await loadBudgetOverview(parsed.data));
});

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = createBudgetImportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "year 为必填" }, { status: 400 });

  return NextResponse.json({ success: true, ...(await importBudgetWorkbook(parsed.data)) });
});
