import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createVoucher } from "@/server/services/finance/ledger/voucher-service";
import { parsePositiveInt, parseYear, parseMonth, parsePageParams } from "@/lib/validation";

export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const status = searchParams.get("status");
  const companyCode = searchParams.get("companyCode");
  const yearNum = parseYear(searchParams.get("year"));
  const monthNum = parseMonth(searchParams.get("month"));
  const keyword = searchParams.get("keyword") || "";
  const { page, pageSize } = parsePageParams(searchParams);
  const where: Prisma.FinanceVoucherWhereInput = {};
  if (periodId) where.periodId = parsePositiveInt(periodId, 0);
  if (status) where.status = status;
  if (companyCode) where.companyCode = companyCode;
  if (yearNum !== null || monthNum !== null) {
    where.period = {};
    if (yearNum !== null) where.period.year = yearNum;
    if (monthNum !== null) where.period.month = monthNum;
  }
  if (keyword) {
    where.OR = [
      { voucherNo: { contains: keyword } },
      { description: { contains: keyword } },
    ];
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

export const POST = withFinanceLedgerWrite(async (request: Request, user) => {
  const body = await request.json();
  const result = await createVoucher(body, user.userId);
  if (result.error) {
    const { error, status, ...rest } = result;
    return NextResponse.json({ error, ...rest }, { status: status as number });
  }
  return NextResponse.json(result);
});
