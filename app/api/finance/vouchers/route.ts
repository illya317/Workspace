import { NextResponse } from "next/server";
import { withFinanceAccess, withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export const GET = withFinanceAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const status = searchParams.get("status");
  const where: Prisma.FinanceVoucherWhereInput = {};
  if (periodId) where.periodId = parseInt(periodId);
  if (status) where.status = status;

  const vouchers = await prisma.financeVoucher.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      items: { include: { account: true }, orderBy: { sortOrder: "asc" } },
      period: true,
    },
  });
  return NextResponse.json({ vouchers });
});

interface VoucherItemInput {
  accountId: unknown;
  debit: unknown;
  credit: unknown;
  description?: unknown;
}

export const POST = withFinanceWrite(async (request: Request, user) => {
  const body = (await request.json()) as Record<string, unknown>;
  const voucherNo = body.voucherNo as string;
  const date = body.date as string;
  const description = body.description as string | undefined;
  const companyCode = body.companyCode as string | undefined;
  const items = body.items as VoucherItemInput[] | undefined;
  const status = body.status as string | undefined;
  if (!voucherNo || !date || !items?.length) {
    return NextResponse.json(
      { error: "凭证号、日期、分录为必填" },
      { status: 400 },
    );
  }

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

  // 根据日期自动推断期间
  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const period = await prisma.financePeriod.findFirst({
    where: { year, month, companyCode: companyCode || null },
  });
  if (!period) {
    return NextResponse.json(
      {
        error: `未找到 ${year}年${month}月 的会计期间，请先创建期间`,
        periodNeeded: { year, month },
      },
      { status: 400 },
    );
  }

  const existing = await prisma.financeVoucher.findUnique({
    where: { voucherNo },
  });
  if (existing)
    return NextResponse.json({ error: "凭证号已存在" }, { status: 400 });

  const voucher = await prisma.financeVoucher.create({
    data: {
      voucherNo,
      date,
      periodId: period.id,
      description: description || "",
      totalDebit,
      totalCredit,
      status: status || "draft",
      companyCode: companyCode || null,
      editedBy: user.userId,
      items: {
        create: items.map((item, idx) => ({
          accountId: parseInt(String(item.accountId)),
          debit: parseFloat(String(item.debit)) || 0,
          credit: parseFloat(String(item.credit)) || 0,
          description: String(item.description || ""),
          sortOrder: idx,
        })),
      },
    },
    include: { items: { include: { account: true } }, period: true },
  });

  return NextResponse.json({ success: true, voucher });
});
