import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { handleCreate } from "@/lib/crud-finance";
import { parsePositiveInt, parseYear, parsePageParams } from "@/lib/validation";

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode") || undefined;
  const subjectLevel = searchParams.get("subjectLevel");
  const scope = searchParams.get("scope") || "mapped";
  const yearNum = parseYear(searchParams.get("year"));
  const keyword = searchParams.get("keyword") || "";

  const where: Record<string, unknown> = {};
  if (keyword) {
    where.OR = [
      { code: { contains: keyword } },
      { name: { contains: keyword } },
    ];
  }
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
    const sl = parsePositiveInt(subjectLevel, 0);
    if (sl > 0) where.subjectLevel = sl;
  }
  if (yearNum !== null) where.year = yearNum;

  const { page, pageSize } = parsePageParams(searchParams);
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

export const POST = withFinanceLedgerWrite(async (request) => {
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
