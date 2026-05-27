import { NextResponse } from "next/server";
import { withContractAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

export const PATCH = withContractAccess(async (request) => {
  const id = parseInt(request.url.split("/").pop() || "");
  if (!id) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  const body = await request.json();
  const allowed = [
    "name",
    "contractNo",
    "partyA",
    "partyB",
    "shareholder",
    "category",
    "content",
    "handler",
    "signDate",
    "endDate",
    "status",
    "amount",
    "executedAmount",
    "location",
    "remark",
  ];
  const updateData: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) {
      const val = body[key];
      if (key === "amount" || key === "executedAmount") {
        updateData[key] = val != null ? parseFloat(val) : null;
      } else {
        updateData[key] = val ?? null;
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "无更新内容" }, { status: 400 });
  }

  await prisma.contract.update({
    where: { id },
    data: { ...updateData, version: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withContractAccess(async (request) => {
  const id = parseInt(request.url.split("/").pop() || "");
  if (!id) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  await prisma.contract.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
