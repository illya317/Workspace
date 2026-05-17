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

  const admins = await prisma.userResourceRole.findMany({
    where: {
      resource: { key: "work.report" },
      role: { key: "admin" },
      scopeId: String(groupId),
    },
  });

  const userIds = admins.map((a) => a.userId).filter((id): id is number => id !== null);

  if (userIds.length === 0) {
    return NextResponse.json({ admins: [] });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, username: true },
  });

  // Get employeeId from Employee table via userId
  const employees = await prisma.employee.findMany({
    where: { userId: { in: userIds } },
    select: { employeeId: true, userId: true },
  });
  const employeeIdByUserId = new Map(
    employees.filter((e) => e.userId).map((e) => [e.userId!, e.employeeId])
  );
  const employeeIds = [...employeeIdByUserId.values()];

  let employeeMap = new Map<string, { dept1: string | null; position: string | null }>();
  if (employeeIds.length > 0) {
    const empsWithPos = await prisma.employee.findMany({
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
    for (const e of empsWithPos) {
      const primary = e.positions.find((p) => p.isPrimary) || e.positions[0];
      employeeMap.set(e.employeeId, {
        dept1: primary?.department?.name || null,
        position: primary?.position?.name || null,
      });
    }
  }

  const result = users.map((u) => {
    const eid = employeeIdByUserId.get(u.id) || "";
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      dept1: employeeMap.get(eid)?.dept1 || "",
      position: employeeMap.get(eid)?.position || "",
    };
  });

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

  await prisma.userResourceRole.deleteMany({
    where: {
      resource: { key: "work.report" },
      role: { key: "admin" },
      scopeId: String(groupId),
    },
  });

  if (userIds?.length > 0) {
    const rgRes = await prisma.resource.findUnique({ where: { key: "work.report" } });
    const adminRole = await prisma.role.findUnique({ where: { key: "admin" } });
    await prisma.userResourceRole.createMany({
      data: userIds.map((userId) => ({
        userId,
        resourceId: rgRes!.id,
        roleId: adminRole!.id,
        scopeId: String(groupId),
      })),
    });
  }

  return NextResponse.json({ success: true });
}
