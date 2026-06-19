import { NextResponse } from "next/server";
import { withFinanceBudgetAccess, withFinanceBudgetWrite } from "@/lib/with-auth";
import {
  readDeptBudget,
  readRdBudget,
  loadDeptBudgetFromDb,
  loadRdBudgetFromDb,
  importDeptBudgetToDb,
  importRdBudgetToDb,
} from "@workspace/finance/server/budget/budget-data";
import {
  createBudgetVersion,
  getActiveVersion,
} from "@workspace/finance/server/budget/budget-version";

export const GET = withFinanceBudgetAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2026");
  const companyCode = searchParams.get("companyCode") || undefined;
  const versionIdParam = searchParams.get("versionId");

  let versionId: number | null = null;

  if (versionIdParam) {
    // 用户明确指定了版本，严格按版本查询
    versionId = parseInt(versionIdParam);
  } else {
    // 未指定版本，查找 active version
    const active = await getActiveVersion(year, companyCode);
    versionId = active?.id ?? null;
  }

  let deptBudget: unknown[] = [];
  let rdBudget: unknown[] = [];

  if (versionId) {
    deptBudget = await loadDeptBudgetFromDb(versionId);
    rdBudget = await loadRdBudgetFromDb(versionId);
  }

  // Fallback 到 Excel：仅当没有任何 active version 时（兼容旧数据）
  if (!versionId) {
    const rawDept = readDeptBudget();
    deptBudget = rawDept.map((i) => ({ ...i, accountId: null, accountCode: null, accountActive: null }));
    const rawRd = readRdBudget();
    rdBudget = rawRd.map((i) => ({ ...i, accountId: null, accountCode: null, accountActive: null }));
  }

  return NextResponse.json({ deptBudget, rdBudget, versionId });
});

export const POST = withFinanceBudgetWrite(async (request: Request) => {
  const { year, companyCode } = await request.json();
  if (!year || isNaN(parseInt(year))) {
    return NextResponse.json({ error: "year 为必填" }, { status: 400 });
  }

  const version = await createBudgetVersion({
    year: parseInt(year),
    companyCode,
    name: `导入于 ${new Date().toLocaleDateString("zh-CN")}`,
    type: "all",
  });

  const deptCount = await importDeptBudgetToDb(parseInt(year), companyCode, version.id);
  const rdCount = await importRdBudgetToDb(parseInt(year), companyCode, version.id);

  return NextResponse.json({ success: true, version, deptCount, rdCount });
});
