import { NextResponse } from "next/server";
import { withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

/** 初始化财务基础数据：默认期间 + 标准科目 */
export const POST = withFinanceWrite(async (request: Request, user) => {
  const body = await request.json();
  const { year = 2025, month = 1 } = body;

  // 1. 创建期间
  let period = await prisma.financePeriod.findFirst({
    where: { year, month },
  });
  if (!period) {
    period = await prisma.financePeriod.create({
      data: {
        year,
        month,
        startDate: `${year}-${String(month).padStart(2, "0")}-01`,
        endDate: `${year}-${String(month).padStart(2, "0")}-31`,
      },
    });
  }

  // 2. 创建标准科目（如果不存在）
  const defaultAccounts = [
    { code: "1001", name: "库存现金", category: "asset", balanceDirection: "debit", sortOrder: 1 },
    { code: "1002", name: "银行存款", category: "asset", balanceDirection: "debit", sortOrder: 2 },
    { code: "1122", name: "应收账款", category: "asset", balanceDirection: "debit", sortOrder: 3 },
    { code: "1403", name: "原材料", category: "asset", balanceDirection: "debit", sortOrder: 4 },
    { code: "1405", name: "库存商品", category: "asset", balanceDirection: "debit", sortOrder: 5 },
    { code: "1601", name: "固定资产", category: "asset", balanceDirection: "debit", sortOrder: 6 },
    { code: "1602", name: "累计折旧", category: "asset", balanceDirection: "credit", sortOrder: 7 },
    { code: "2001", name: "短期借款", category: "liability", balanceDirection: "credit", sortOrder: 8 },
    { code: "2202", name: "应付账款", category: "liability", balanceDirection: "credit", sortOrder: 9 },
    { code: "4001", name: "实收资本", category: "equity", balanceDirection: "credit", sortOrder: 10 },
    { code: "4103", name: "本年利润", category: "equity", balanceDirection: "credit", sortOrder: 11 },
    { code: "5001", name: "生产成本", category: "cost", balanceDirection: "debit", sortOrder: 12 },
    { code: "5101", name: "制造费用", category: "cost", balanceDirection: "debit", sortOrder: 13 },
    { code: "6001", name: "主营业务收入", category: "revenue", balanceDirection: "credit", sortOrder: 14 },
    { code: "6401", name: "主营业务成本", category: "revenue", balanceDirection: "debit", sortOrder: 15 },
    { code: "6601", name: "销售费用", category: "revenue", balanceDirection: "debit", sortOrder: 16 },
    { code: "6602", name: "管理费用", category: "revenue", balanceDirection: "debit", sortOrder: 17 },
    { code: "6603", name: "财务费用", category: "revenue", balanceDirection: "debit", sortOrder: 18 },
  ];

  const createdAccounts = [];
  for (const acc of defaultAccounts) {
    const existing = await prisma.financeAccount.findUnique({ where: { code: acc.code } });
    if (!existing) {
      const created = await prisma.financeAccount.create({
        data: { ...acc, editedBy: user.userId },
      });
      createdAccounts.push(created);
    }
  }

  return NextResponse.json({
    success: true,
    period,
    accountsCreated: createdAccounts.length,
    totalAccounts: defaultAccounts.length,
  });
});
