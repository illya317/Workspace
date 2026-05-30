import { NextResponse } from "next/server";
import { withFinanceAccess, withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createVoucher } from "@/server/services/finance/voucher-service";

export const GET = withFinanceAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const status = searchParams.get("status");
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
  const where: Prisma.FinanceVoucherWhereInput = {};
  if (periodId) where.periodId = parseInt(periodId);
  if (status) where.status = status;
  if (companyCode) where.companyCode = companyCode;
  if (year || month) {
    where.period = {};
    if (year) where.period.year = parseInt(year, 10);
    if (month) where.period.month = parseInt(month, 10);
  }

  const [vouchers, total] = await Promise.all([
    prisma.financeVoucher.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: { include: { account: true }, orderBy: { sortOrder: "asc" } },
        period: true,
      },
    }),
    prisma.financeVoucher.count({ where }),
  ]);
  const totalPages = Math.ceil(total / pageSize);
  return NextResponse.json({
    data: vouchers,
    total,
    page,
    pageSize,
    totalPages,
    vouchers,
  });
});

export const POST = withFinanceWrite(async (request: Request, user) => {
  const body = await request.json();
  const result = await createVoucher(body, user.userId);
  if (result.error) {
    const { error, status, ...rest } = result;
    return NextResponse.json({ error, ...rest }, { status: status as number });
  }
  return NextResponse.json(result);
});
