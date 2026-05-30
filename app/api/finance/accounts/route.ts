import { NextResponse } from "next/server";
import { withFinanceAccess, withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { handleCreate } from "@/lib/crud-finance";

export const GET = withFinanceAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode") || undefined;
  const subjectLevel = searchParams.get("subjectLevel");
  const scope = searchParams.get("scope") || "mapped";
  const year = searchParams.get("year");

  const where: Record<string, unknown> = {};
  if (scope === "mapped") {
    where.groupSubjectCode = { not: null };
  } else if (scope === "unmapped") {
    where.groupSubjectCode = null;
  } else if (scope === "inactive") {
    where.isActive = false;
  }
  if (companyCode) {
    where.companyCode = companyCode;
  }
  if (subjectLevel) {
    where.subjectLevel = parseInt(subjectLevel, 10);
  }
  if (year) {
    where.year = parseInt(year, 10);
  }

  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
  const skip = (page - 1) * pageSize;

  const [accounts, total] = await Promise.all([
    prisma.financeAccount.findMany({
      where,
      orderBy: [{ code: "asc" }],
      skip,
      take: pageSize,
      include: {
        parent: { select: { code: true, name: true } },
      },
    }),
    prisma.financeAccount.count({ where }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return NextResponse.json({
    data: accounts,
    total,
    page,
    pageSize,
    totalPages,
    accounts,
  });
});

export const POST = withFinanceWrite(async (request) => {
  const body = await request.json();
  const { code, name, category, parentId, balanceDirection, companyCode } = body;
  if (!code || !name || !category) {
    return NextResponse.json({ error: "科目编码、名称、类别为必填" }, { status: 400 });
  }

  return handleCreate(request, {
    entityType: "FinanceAccount",
    modelKey: "financeAccount",
    allowedFields: ["code", "name", "category", "parentId", "balanceDirection", "companyCode", "mnemonicCode", "currency", "groupSubjectCode", "subjectLevel", "sortOrder", "isActive"],
  }, async () => ({
    code,
    name,
    category,
    parentId: parentId ? parseInt(parentId) : null,
    balanceDirection: balanceDirection || "debit",
    companyCode: companyCode || null,
    mnemonicCode: body.mnemonicCode || null,
    currency: body.currency || null,
    groupSubjectCode: body.groupSubjectCode || null,
    subjectLevel: body.subjectLevel ? parseInt(body.subjectLevel) : null,
    isActive: body.isActive !== undefined ? body.isActive : true,
    sortOrder: body.sortOrder || 0,
  }));
});
