import { NextResponse } from "next/server";
import { withFinanceBudgetAccess, withFinanceBudgetWrite } from "@/lib/with-auth";
import { readDeptBudget, readRdBudget, loadDeptBudgetFromDb, loadRdBudgetFromDb, importDeptBudgetToDb, importRdBudgetToDb } from "@/server/services/finance/budget-data";

export const GET = withFinanceBudgetAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2026");
  const companyCode = searchParams.get("companyCode") || undefined;

  let deptBudget = await loadDeptBudgetFromDb(year, companyCode);
  let rdBudget = await loadRdBudgetFromDb(year, companyCode);

  // Fallback to Excel if DB is empty
  if (deptBudget.length === 0) {
    const raw = readDeptBudget();
    deptBudget = raw.map((i) => ({ ...i, accountId: null, accountCode: null, accountActive: null }));
  }
  if (rdBudget.length === 0) {
    const raw = readRdBudget();
    rdBudget = raw.map((i) => ({ ...i, accountId: null, accountCode: null, accountActive: null }));
  }

  return NextResponse.json({ deptBudget, rdBudget });
});

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  const { year, companyCode } = await request.json();
  if (!year || isNaN(parseInt(year))) {
    return NextResponse.json({ error: "year 为必填" }, { status: 400 });
  }

  const deptCount = await importDeptBudgetToDb(parseInt(year), companyCode);
  const rdCount = await importRdBudgetToDb(parseInt(year), companyCode);

  return NextResponse.json({ success: true, deptCount, rdCount });
});
