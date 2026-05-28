import { NextResponse } from "next/server";
import { withInventoryAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { handleCreate } from "@/lib/crud-inventory";
import { Prisma } from "@/generated/prisma/client";

export const GET = withInventoryAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const status = searchParams.get("status") || "";

  const where: Prisma.StockPackagingWhereInput = {};
  if (status) where.status = status;

  let items = await prisma.stockPackaging.findMany({ where, orderBy: { code: "asc" } });
  if (keyword) {
    const k = keyword.toLowerCase();
    items = items.filter((i) => i.code.toLowerCase().includes(k) || i.name.toLowerCase().includes(k));
  }
  return NextResponse.json({ items });
});

export const POST = withInventoryAccess(async (request: Request, _user) => {
  const body = await request.json();
  const { code, name, spec, unit, packagingType, status } = body;
  if (!code || !name) return NextResponse.json({ error: "物料编码和名称为必填" }, { status: 400 });

  const existing = await prisma.stockPackaging.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ error: "物料编码已存在" }, { status: 400 });

  return handleCreate(request, {
    entityType: "StockPackaging",
    modelKey: "stockPackaging",
  }, async () => ({
    code, name, spec: spec || null, unit: unit || "卷",
    packagingType: packagingType || "小容量",
    status: status || "正常",
  }));
});
