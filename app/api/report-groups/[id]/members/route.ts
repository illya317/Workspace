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

  const members = await prisma.reportGroupMember.findMany({
    where: { reportGroupId: groupId },
    select: { userId: true },
  });

  const userIds = members.map((m) => m.userId);

  if (userIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, employeeId: true },
  });

  const employeeIds = users.map((u) => u.employeeId).filter(Boolean) as string[];

  let employeeMap = new Map<string, { dept1: string | null; position: string | null }>();
  if (employeeIds.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { employeeId: true, dept1: true, position: true },
    });
    for (const e of employees) {
      employeeMap.set(e.employeeId, { dept1: e.dept1, position: e.position });
    }
  }

  const result = users.map((u) => ({
    userId: u.id,
    name: u.name,
    dept1: employeeMap.get(u.employeeId || "")?.dept1 || "",
    position: employeeMap.get(u.employeeId || "")?.position || "",
  }));

  return NextResponse.json({ members: result });
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

  await prisma.reportGroupMember.deleteMany({
    where: { reportGroupId: groupId },
  });

  if (userIds?.length > 0) {
    await prisma.reportGroupMember.createMany({
      data: userIds.map((userId) => ({
        reportGroupId: groupId,
        userId,
      })),
    });
  }

  return NextResponse.json({ success: true });
}
