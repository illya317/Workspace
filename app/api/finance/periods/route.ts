import { NextResponse } from "next/server";
import { withFinanceAccess, withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const GET = withFinanceAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const where: Prisma.FinancePeriodWhereInput = {};
  if (year) where.year = parseInt(year);

  const periods = await prisma.financePeriod.findMany({
    where,
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return NextResponse.json({ periods });
});

export const POST = withFinanceWrite(async (request: Request, _user) => {
  const body = await request.json();
  const { year, month, startDate, endDate, companyCode } = body;
  if (!year || !month) {
    return NextResponse.json({ error: "年份和月份为必填" }, { status: 400 });
  }

  const existing = await prisma.financePeriod.findFirst({
    where: { year: parseInt(year), month: parseInt(month), companyCode: companyCode || null },
  });
  if (existing) return NextResponse.json({ error: "该期间已存在" }, { status: 400 });

  const period = await prisma.financePeriod.create({
    data: {
      year: parseInt(year),
      month: parseInt(month),
      startDate: startDate || `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: endDate || `${year}-${String(month).padStart(2, "0")}-31`,
      companyCode: companyCode || null,
    },
  });
  return NextResponse.json({ success: true, period });
});
