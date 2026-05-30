import { NextResponse } from "next/server";
import { withFinanceBudgetAccess, withFinanceBudgetWrite } from "@/lib/with-auth";
import { listBudgetVersions, createBudgetVersion } from "@/server/services/finance/budget/budget-version";

export const GET = withFinanceBudgetAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2026");
  const companyCode = searchParams.get("companyCode") || undefined;
  const versions = await listBudgetVersions(year, companyCode);
  return NextResponse.json({ versions });
});

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  const body = await request.json();
  const { year, companyCode, name, type } = body;
  if (!year || !name) {
    return NextResponse.json({ error: "year 和 name 为必填" }, { status: 400 });
  }
  const version = await createBudgetVersion({ year, companyCode, name, type });
  return NextResponse.json({ version });
});
