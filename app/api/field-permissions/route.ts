import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const perms = await prisma.fieldPermission.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ field: "asc" }, { userId: "asc" }],
  });

  return NextResponse.json({ permissions: perms });
}

export async function PUT(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { field, userId, canRead, canEdit } = body as {
    field: string;
    userId: number;
    canRead: boolean;
    canEdit: boolean;
  };

  const existing = await prisma.fieldPermission.findFirst({
    where: { field, userId },
  });

  if (existing) {
    await prisma.fieldPermission.update({
      where: { id: existing.id },
      data: { canRead, canEdit },
    });
  } else {
    await prisma.fieldPermission.create({
      data: { field, userId, canRead, canEdit },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  await prisma.fieldPermission.delete({
    where: { id: parseInt(id) },
  });

  return NextResponse.json({ success: true });
}
