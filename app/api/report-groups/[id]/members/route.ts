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

  const members = await prisma.userResourceRole.findMany({
    where: {
      resource: { key: "report_group" },
      role: { key: "member" },
      scopeId: String(groupId),
    },
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
      include: {
        positions: {
          include: {
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
      },
    });
    for (const e of employees) {
      const primary = e.positions.find((p) => p.isPrimary) || e.positions[0];
      employeeMap.set(e.employeeId, {
        dept1: primary?.department?.name || null,
        position: primary?.position?.name || null,
      });
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

  await prisma.userResourceRole.deleteMany({
    where: {
      resource: { key: "report_group" },
      role: { key: "member" },
      scopeId: String(groupId),
    },
  });

  if (userIds?.length > 0) {
    const rgRes = await prisma.resource.findUnique({ where: { key: "report_group" } });
    const memberRole = await prisma.role.findUnique({ where: { key: "member" } });
    await prisma.userResourceRole.createMany({
      data: userIds.map((userId) => ({
        userId,
        resourceId: rgRes!.id,
        roleId: memberRole!.id,
        scopeId: String(groupId),
      })),
    });
  }

  return NextResponse.json({ success: true });
}
