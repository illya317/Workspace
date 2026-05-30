import { NextResponse } from "next/server";
import { withFinanceLedgerWrite, withFinanceLedgerDelete } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerWrite(async (req, user) => {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const date = body.date as string | undefined;
    const description = body.description as string | undefined;
    const status = body.status as string | undefined;
    const items = body.items as Array<{ accountId: unknown; debit: unknown; credit: unknown; description?: unknown }> | undefined;

    const voucher = await prisma.financeVoucher.findUnique({
      where: { id: parseInt(id) },
      include: { items: true },
    });
    if (!voucher)
      return NextResponse.json({ error: "凭证不存在" }, { status: 404 });
    if (voucher.status === "posted" && !status) {
      return NextResponse.json(
        { error: "已过账凭证不能直接修改，请先反过账" },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {
      editedBy: user.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    };
    if (date && date !== voucher.date) {
      updateData.date = date;
      const dateObj = new Date(date);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth() + 1;
      const period = await prisma.financePeriod.findFirst({
        where: { year, month, companyCode: voucher.companyCode },
      });
      if (period) updateData.periodId = period.id;
    }
    if (description !== undefined) updateData.description = description;
    if (status) updateData.status = status;

    if (items && items.length > 0) {
      const totalDebit = items.reduce(
        (s: number, i) => s + (parseFloat(String(i.debit)) || 0),
        0,
      );
      const totalCredit = items.reduce(
        (s: number, i) => s + (parseFloat(String(i.credit)) || 0),
        0,
      );
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        return NextResponse.json({ error: "借贷不平衡" }, { status: 400 });
      }
      updateData.totalDebit = totalDebit;
      updateData.totalCredit = totalCredit;

      // 删除旧分录，创建新分录
      await prisma.financeVoucherItem.deleteMany({
        where: { voucherId: parseInt(id) },
      });
      updateData.items = {
        create: items.map((item, idx) => ({
          accountId: parseInt(String(item.accountId)),
          debit: parseFloat(String(item.debit)) || 0,
          credit: parseFloat(String(item.credit)) || 0,
          description: String(item.description || ""),
          sortOrder: idx,
        })),
      };
    }

    const updated = await prisma.financeVoucher.update({
      where: { id: parseInt(id) },
      data: updateData as unknown as Prisma.FinanceVoucherUpdateInput,
      include: { items: { include: { account: true } }, period: true },
    });

    return NextResponse.json({ success: true, voucher: updated });
  })(request);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerDelete(async () => {
    const { id } = await params;
    await prisma.financeVoucher.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  })(request);
}
