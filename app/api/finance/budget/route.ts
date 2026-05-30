import { NextResponse } from "next/server";
import { withFinanceAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { readDeptBudget, readRdBudget } from "@/server/services/finance/budget-data";

interface DeptBudgetItem {
  dept: string;
  account: string;
  total: number;
  months: number[];
  expenseType: string;
  accountId: number | null;
  accountCode: string | null;
  accountActive: boolean | null;
}

interface RdBudgetItem {
  project: string;
  category: string;
  total: number;
  months: number[];
  accountId: number | null;
  accountCode: string | null;
  accountActive: boolean | null;
}

export const GET = withFinanceAccess(async () => {
  try {
    const deptRaw = readDeptBudget();
    const rdRaw = readRdBudget();

    // FIXME: 运行时按 name 动态匹配，不是数据库外键。
    const accountNames = new Set([...deptRaw.map((i) => i.account), ...rdRaw.map((i) => i.category)]);
    const accounts = await prisma.financeAccount.findMany({
      where: { name: { in: Array.from(accountNames) } },
      select: { id: true, name: true, code: true, isActive: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.name, a]));

    const deptBudget: DeptBudgetItem[] = deptRaw.map((i) => {
      const acc = accountMap.get(i.account);
      return { ...i, accountId: acc?.id ?? null, accountCode: acc?.code ?? null, accountActive: acc?.isActive ?? null };
    });
    const rdBudget: RdBudgetItem[] = rdRaw.map((i) => {
      const acc = accountMap.get(i.category);
      return { ...i, accountId: acc?.id ?? null, accountCode: acc?.code ?? null, accountActive: acc?.isActive ?? null };
    });

    return NextResponse.json({ deptBudget, rdBudget });
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取预算数据失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
