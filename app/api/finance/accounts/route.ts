import { NextResponse } from "next/server";
import { withFinanceAccess, withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { handleCreate } from "@/lib/crud-finance";

export const GET = withFinanceAccess(async () => {
  const accounts = await prisma.financeAccount.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return NextResponse.json({ accounts });
});

export const POST = withFinanceWrite(async (request) => {
  const body = await request.json();
  const { code, name, category, parentId, balanceDirection, companyCode } = body;
  if (!code || !name || !category) {
    return NextResponse.json({ error: "科目编码、名称、类别为必填" }, { status: 400 });
  }
  const existing = await prisma.financeAccount.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ error: "科目编码已存在" }, { status: 400 });

  return handleCreate(request, {
    entityType: "FinanceAccount",
    modelKey: "financeAccount",
    allowedFields: ["code", "name", "category", "parentId", "balanceDirection", "companyCode", "sortOrder", "isActive"],
  }, async () => ({
    code, name, category,
    parentId: parentId ? parseInt(parentId) : null,
    balanceDirection: balanceDirection || "debit",
    companyCode: companyCode || null,
    isActive: true,
    sortOrder: body.sortOrder || 0,
  }));
});
