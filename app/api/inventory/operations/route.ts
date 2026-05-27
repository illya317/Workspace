import { NextResponse } from "next/server";
import { withInventoryAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const GET = withInventoryAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  const where: Prisma.StockOperationWhereInput = {};
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = parseInt(targetId);

  const ops = await prisma.stockOperation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { editor: { select: { name: true } } },
  });
  return NextResponse.json({ operations: ops });
});

export const POST = withInventoryAccess(async (request: Request, user) => {
  const body = await request.json();
  const { opType, targetType, targetId, quantity, docNo, reason } = body;
  if (!opType || !targetType || !targetId || quantity === undefined) {
    return NextResponse.json({ error: "操作类型、对象类型、对象ID、数量为必填" }, { status: 400 });
  }

  const q = parseFloat(quantity);

  // 根据目标类型更新库存
  if (targetType === "raw_material") {
    const field = opType === "purchase" ? "currentPurchase" : opType === "consume" ? "currentConsume" : "";
    if (field) {
      const existing = await prisma.stockRawMaterial.findUnique({ where: { id: parseInt(targetId) } });
      if (!existing) return NextResponse.json({ error: "库存对象不存在" }, { status: 404 });
      await prisma.stockRawMaterial.update({
        where: { id: parseInt(targetId) },
        data: { [field]: (existing as unknown as Record<string, number>)[field] + q },
      });
    }
  } else if (targetType === "packaging") {
    const field = opType === "inbound" ? "currentInbound" : opType === "outbound" ? "currentOutbound" : "";
    if (field) {
      const existing = await prisma.stockPackaging.findUnique({ where: { id: parseInt(targetId) } });
      if (!existing) return NextResponse.json({ error: "库存对象不存在" }, { status: 404 });
      await prisma.stockPackaging.update({
        where: { id: parseInt(targetId) },
        data: { [field]: (existing as unknown as Record<string, number>)[field] + q },
      });
    }
  } else if (targetType === "finished_goods") {
    const field = opType === "inbound" ? "currentInbound" : opType === "outbound" ? "currentOutbound" : "";
    if (field) {
      const existing = await prisma.stockFinishedGoods.findUnique({ where: { id: parseInt(targetId) } });
      if (!existing) return NextResponse.json({ error: "库存对象不存在" }, { status: 404 });
      await prisma.stockFinishedGoods.update({
        where: { id: parseInt(targetId) },
        data: { [field]: (existing as unknown as Record<string, number>)[field] + q },
      });
    }
  }

  const op = await prisma.stockOperation.create({
    data: {
      opType, targetType, targetId: parseInt(targetId),
      quantity: q, docNo: docNo || null, reason: reason || null,
      operatorId: user.userId,
    },
  });

  return NextResponse.json({ success: true, operation: op });
});
