import { NextResponse } from "next/server";
import { requireGroupAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const groupId = parseInt(id);

  const { error, status } = await requireGroupAdmin(request, groupId);
  if (error) return NextResponse.json({ error }, { status });

  const viewers = await prisma.reportGroupViewer.findMany({
    where: { reportGroupId: groupId },
    select: { userId: true },
  });

  return NextResponse.json({ userIds: viewers.map((v) => v.userId) });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const groupId = parseInt(id);

  const { error, status } = await requireGroupAdmin(request, groupId);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { userIds } = body as { userIds: number[] };

  await prisma.reportGroupViewer.deleteMany({
    where: { reportGroupId: groupId },
  });

  if (userIds?.length > 0) {
    await prisma.reportGroupViewer.createMany({
      data: userIds.map((userId) => ({
        reportGroupId: groupId,
        userId,
      })),
    });
  }

  return NextResponse.json({ success: true });
}
