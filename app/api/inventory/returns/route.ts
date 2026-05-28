import { NextResponse } from "next/server";
import { withInventoryAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export const GET = withInventoryAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const finishedGoodsId = searchParams.get("finishedGoodsId");
  const where: Prisma.StockReturnWhereInput = {};
  if (finishedGoodsId) where.finishedGoodsId = parseInt(finishedGoodsId);

  const returns = await prisma.stockReturn.findMany({ where, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ returns });
});

export const POST = withInventoryAccess(async (request: Request) => {
  const body = await request.json();
  const { finishedGoodsId, returnDate, quantity, salesman, reason } = body;
  if (!finishedGoodsId || !returnDate || quantity === undefined) {
    return NextResponse.json({ error: "成品ID、退货日期、数量为必填" }, { status: 400 });
  }

  const ret = await prisma.stockReturn.create({
    data: {
      finishedGoodsId: parseInt(finishedGoodsId),
      returnDate,
      quantity: parseFloat(quantity),
      salesman: salesman || null,
      reason: reason || null,
    },
  });

  return NextResponse.json({ success: true, return: ret });
});
