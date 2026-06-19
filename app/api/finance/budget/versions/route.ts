import { NextResponse } from "next/server";
import { withFinanceBudgetAccess, withFinanceBudgetWrite } from "@/lib/with-auth";
import { listBudgetVersions, createBudgetVersion } from "@workspace/finance/server/budget/budget-version";
import {
  budgetVersionQuerySchema,
  createBudgetVersionSchema,
} from "@workspace/finance/server/budget/schemas";

export const GET = withFinanceBudgetAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = budgetVersionQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const { year, companyCode } = parsed.data;
  const versions = await listBudgetVersions(year, companyCode);
  return NextResponse.json({ versions });
});

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = createBudgetVersionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "year 和 name 为必填" }, { status: 400 });
  const version = await createBudgetVersion(parsed.data);
  return NextResponse.json({ version });
});
