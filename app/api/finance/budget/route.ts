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
import {
  budgetQuerySchema,
  createBudgetImportSchema,
} from "@workspace/finance/server/budget/schemas";

export const GET = withFinanceBudgetAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = budgetQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const { year, companyCode } = parsed.data;

  let versionId: number | null = null;

  if (parsed.data.versionId) {
    // 用户明确指定了版本，严格按版本查询
    versionId = parsed.data.versionId;
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
  const body = await request.json().catch(() => null);
  const parsed = createBudgetImportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "year 为必填" }, { status: 400 });
  const { year, companyCode } = parsed.data;

  const version = await createBudgetVersion({
    year,
    companyCode,
    name: `导入于 ${new Date().toLocaleDateString("zh-CN")}`,
    type: "all",
  });

  const deptCount = await importDeptBudgetToDb(year, companyCode, version.id);
  const rdCount = await importRdBudgetToDb(year, companyCode, version.id);

  return NextResponse.json({ success: true, version, deptCount, rdCount });
});
