import { NextResponse } from "next/server";
import { requireAdmin, requireGroupAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const groupId = parseInt(id);

  const { error, status } = await requireGroupAdmin(request, groupId);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { name, description, sortOrder, departmentId } = body;

  const group = await prisma.reportGroup.update({
    where: { id: groupId },
    data: {
      name,
      description: description ?? undefined,
      sortOrder: sortOrder ?? undefined,
      departmentId: departmentId === "" ? null : (departmentId ?? undefined),
    },
  });

  return NextResponse.json({ group });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { id } = await params;

  await prisma.reportGroup.delete({
    where: { id: parseInt(id) },
  });

  return NextResponse.json({ success: true });
}
