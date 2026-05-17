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

  const viewers = await prisma.userResourceRole.findMany({
    where: {
      resource: { key: "work.report" },
      role: { key: "read" },
      scopeId: String(groupId),
    },
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

  await prisma.userResourceRole.deleteMany({
    where: {
      resource: { key: "work.report" },
      role: { key: "read" },
      scopeId: String(groupId),
    },
  });

  if (userIds?.length > 0) {
    const rgRes = await prisma.resource.findUnique({ where: { key: "work.report" } });
    const viewerRole = await prisma.role.findUnique({ where: { key: "read" } });
    await prisma.userResourceRole.createMany({
      data: userIds.map((userId) => ({
        userId,
        resourceId: rgRes!.id,
        roleId: viewerRole!.id,
        scopeId: String(groupId),
      })),
    });
  }

  return NextResponse.json({ success: true });
}
