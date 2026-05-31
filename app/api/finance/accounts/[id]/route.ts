import { NextResponse } from "next/server";
import { withFinanceLedgerWrite, withFinanceLedgerDelete } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { handleDelete } from "@/lib/crud-finance";

const CONFIG = {
  entityType: "FinanceAccount",
  modelKey: "financeAccount" as const,
  allowedFields: [],
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerWrite(async (req, user) => {
    const { id } = await params;
    const body = await req.json();
    const { code, name, category, balanceDirection, isActive, sortOrder, reclassTargetCode, companyCode, mnemonicCode, currency, groupSubjectCode, subjectLevel } =
      body;

    const updateData: Record<string, unknown> = {
      editedBy: user.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    };
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (balanceDirection !== undefined)
      updateData.balanceDirection = balanceDirection;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);
    if (reclassTargetCode !== undefined) updateData.reclassTargetCode = reclassTargetCode || null;
    if (companyCode !== undefined) updateData.companyCode = companyCode || null;
    if (mnemonicCode !== undefined) updateData.mnemonicCode = mnemonicCode || null;
    if (currency !== undefined) updateData.currency = currency || null;
    if (groupSubjectCode !== undefined) updateData.groupSubjectCode = groupSubjectCode || null;
    if (subjectLevel !== undefined) updateData.subjectLevel = subjectLevel ? parseInt(subjectLevel) : null;

    const account = await prisma.financeAccount.update({
      where: { id: parseInt(id) },
      data: updateData,
    });
    return NextResponse.json({ success: true, account });
  })(request);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerDelete(async () => {
    return handleDelete(request, params, CONFIG);
  })(request);
}
