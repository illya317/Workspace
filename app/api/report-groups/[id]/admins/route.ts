import { NextResponse } from "next/server";
import { requireAdmin, requireGroupAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const groupId = parseInt(id);

  const { error, status } = await requireGroupAdmin(request, groupId);
  if (error) return NextResponse.json({ error }, { status });

  const admins = await prisma.reportGroupAdmin.findMany({
    where: { reportGroupId: groupId },
  });

  const userIds = admins.map((a) => a.userId);

  if (userIds.length === 0) {
    return NextResponse.json({ admins: [] });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, username: true, employeeId: true },
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
    id: u.id,
    name: u.name,
    username: u.username,
    dept1: employeeMap.get(u.employeeId || "")?.dept1 || "",
    position: employeeMap.get(u.employeeId || "")?.position || "",
  }));

  return NextResponse.json({ admins: result });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { id } = await params;
  const groupId = parseInt(id);
  const body = await request.json();
  const { userIds } = body as { userIds: number[] };

  await prisma.reportGroupAdmin.deleteMany({
    where: { reportGroupId: groupId },
  });

  if (userIds?.length > 0) {
    await prisma.reportGroupAdmin.createMany({
      data: userIds.map((userId) => ({
        reportGroupId: groupId,
        userId,
      })),
    });
  }

  return NextResponse.json({ success: true });
}
