import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true, username: true, name: true, canLogin: true },
  });

  const userIds = users.map((u) => u.id);

  // Employee-user mapping
  const employees = await prisma.employee.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, name: true, employeeId: true },
  });
  const empByUser: Record<number, { name: string; employeeId: string }> = {};
  for (const e of employees) empByUser[e.userId!] = { name: e.name, employeeId: e.employeeId };

  // Employee → positions/departments via EDP
  const employeeList = await prisma.employee.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true },
  });
  const empByUserId = new Map(employeeList.filter(e => e.userId).map(e => [e.userId!, e.id]));

  const positionsByEmpId = new Map<number, number[]>();
  const deptsByEmpId = new Map<number, number[]>();
  const allEdps = await prisma.eDP.findMany({
    where: { employeeId: { in: [...empByUserId.values()] } },
    select: { employeeId: true, positionId: true, departmentId: true },
  });
  for (const edp of allEdps) {
    if (edp.positionId != null) {
      if (!positionsByEmpId.has(edp.employeeId)) positionsByEmpId.set(edp.employeeId, []);
      positionsByEmpId.get(edp.employeeId)!.push(edp.positionId);
    }
    if (edp.departmentId != null) {
      if (!deptsByEmpId.has(edp.employeeId)) deptsByEmpId.set(edp.employeeId, []);
      deptsByEmpId.get(edp.employeeId)!.push(edp.departmentId);
    }
  }

  const allPosIds = [...new Set([...positionsByEmpId.values()].flat())];
  const allDeptIds = [...new Set([...deptsByEmpId.values()].flat())];

  // Batch query all three grant types
  const posGrants = allPosIds.length > 0
    ? await prisma.positionResourceRole.findMany({
        where: { positionId: { in: allPosIds } },
        include: { resource: { select: { key: true } }, role: { select: { key: true } } },
      })
    : [];
  const deptGrants = allDeptIds.length > 0
    ? await prisma.departmentResourceRole.findMany({
        where: { departmentId: { in: allDeptIds } },
        include: { resource: { select: { key: true } }, role: { select: { key: true } } },
      })
    : [];
  const allUserGrants = await prisma.userResourceRole.findMany({
    where: { userId: { in: userIds } },
    include: { resource: { select: { key: true } }, role: { select: { key: true } } },
  });

  // Index position/department grants
  const posGrantByPosId = new Map<number, Array<{ resourceKey: string; roleKey: string }>>();
  for (const g of posGrants) {
    if (!posGrantByPosId.has(g.positionId)) posGrantByPosId.set(g.positionId, []);
    posGrantByPosId.get(g.positionId)!.push({ resourceKey: g.resource.key, roleKey: g.role.key });
  }
  const deptGrantByDeptId = new Map<number, Array<{ resourceKey: string; roleKey: string }>>();
  for (const g of deptGrants) {
    if (!deptGrantByDeptId.has(g.departmentId)) deptGrantByDeptId.set(g.departmentId, []);
    deptGrantByDeptId.get(g.departmentId)!.push({ resourceKey: g.resource.key, roleKey: g.role.key });
  }

  // Merge grants per user: direct + position + department
  const grantsByUser: Record<number, Array<{ resourceKey: string; roleKey: string; scopeId?: string | null }>> = {};
  for (const g of allUserGrants) {
    if (!grantsByUser[g.userId]) grantsByUser[g.userId] = [];
    grantsByUser[g.userId].push({ resourceKey: g.resource.key, roleKey: g.role.key, scopeId: g.scopeId });
  }
  for (const [userId, empId] of empByUserId) {
    if (!grantsByUser[userId]) grantsByUser[userId] = [];
    for (const pid of positionsByEmpId.get(empId) || []) {
      for (const g of posGrantByPosId.get(pid) || []) {
        grantsByUser[userId].push({ resourceKey: g.resourceKey, roleKey: g.roleKey });
      }
    }
    for (const did of deptsByEmpId.get(empId) || []) {
      for (const g of deptGrantByDeptId.get(did) || []) {
        grantsByUser[userId].push({ resourceKey: g.resourceKey, roleKey: g.roleKey });
      }
    }
  }

  // system.admin check: direct, position, or department
  const adminIds = new Set<number>();
  for (const u of users) {
    const hasAdmin = grantsByUser[u.id]?.some(
      (g) => g.resourceKey === "system" && g.roleKey === "admin"
    );
    if (hasAdmin) adminIds.add(u.id);
  }

  const enrichedUsers = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: empByUser[u.id]?.name || u.name,
    employeeId: empByUser[u.id]?.employeeId || null,
    canLogin: u.canLogin,
    isWorkListAdmin: adminIds.has(u.id),
    resourceRoles: grantsByUser[u.id] || [],
  }));

  return NextResponse.json({ users: enrichedUsers });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { name, username } = body;
  if (!name) return NextResponse.json({ error: "姓名为必填" }, { status: 400 });

  const user = await prisma.user.create({
    data: { name, username: username || null, canLogin: true },
  });
  return NextResponse.json({ user });
}
