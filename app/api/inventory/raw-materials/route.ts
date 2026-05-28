import { NextResponse } from "next/server";
import { withInventoryAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { handleCreate } from "@/lib/crud-inventory";
import { Prisma } from "@/generated/prisma/client";

export const GET = withInventoryAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const status = searchParams.get("status") || "";

  const where: Prisma.StockRawMaterialWhereInput = {};
  if (status) where.status = status;

  let items = await prisma.stockRawMaterial.findMany({ where, orderBy: { code: "asc" } });
  if (keyword) {
    const k = keyword.toLowerCase();
    items = items.filter((i) => i.code.toLowerCase().includes(k) || i.name.toLowerCase().includes(k));
  }
  return NextResponse.json({ items });
});

export const POST = withInventoryAccess(async (request: Request, _user) => {
  const body = await request.json();
  const { code, name, spec, unit, manufacturer, status } = body;
  if (!code || !name) return NextResponse.json({ error: "物料编码和名称为必填" }, { status: 400 });

  const existing = await prisma.stockRawMaterial.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ error: "物料编码已存在" }, { status: 400 });

  return handleCreate(request, {
    entityType: "StockRawMaterial",
    modelKey: "stockRawMaterial",
  }, async () => ({
    code, name, spec: spec || null, unit: unit || "kg",
    manufacturer: manufacturer || null,
    status: status || "正常",
  }));
});
