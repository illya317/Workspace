import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  // 获取所有员工（含岗位信息）
  const employees = await prisma.employee.findMany({
    orderBy: [{ employeeId: "asc" }],
    include: {
      positions: {
        include: {
          department: { select: { name: true, managementGroup: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  // 合并多岗人员，保留每个角色的 company/dept/position
  const mergedMap = new Map<
    string,
    {
      employeeId: string;
      name: string;
      roles: { managementGroup: string | null; dept1: string | null; position: string | null }[];
    }
  >();

  for (const emp of employees) {
    const key = emp.employeeId;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        employeeId: emp.employeeId,
        name: emp.name,
        roles: [],
      });
    }
    const item = mergedMap.get(key)!;
    if (emp.positions.length === 0) {
      item.roles.push({ managementGroup: null, dept1: null, position: null });
    } else {
      for (const pos of emp.positions) {
        item.roles.push({
          managementGroup: pos.department?.company || null,
          dept1: pos.department?.name || null,
          position: pos.position?.name || null,
        });
      }
    }
  }

  // 获取所有用户及其 UserResourceRole 权限数据
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      canLogin: true,
      apiKey: true,
      resourceRoles: {
        include: {
          resource: { select: { key: true, name: true } },
          role: { select: { key: true, name: true } },
        },
      },
    },
  });

  // Get employeeId from Employee table via userId
  const employeesForLink = await prisma.employee.findMany({
    where: { userId: { not: null } },
    select: { employeeId: true, userId: true },
  });
  const employeeIdByUserId = new Map(
    employeesForLink.filter((e: any) => e.userId).map((e: any) => [e.userId!, e.employeeId])
  );

  const userByEmployeeId = new Map(
    users.filter((u: any) => employeeIdByUserId.has(u.id)).map((u: any) => [employeeIdByUserId.get(u.id)!, u])
  );
  const userByName = new Map(users.map((u: any) => [u.name, u]));

  const result = Array.from(mergedMap.values()).map((item) => {
    const linkedUser: any =
      userByEmployeeId.get(item.employeeId) || userByName.get(item.name);
    const rrs = linkedUser?.resourceRoles ?? [];
    return {
      employeeId: item.employeeId,
      name: item.name,
      roles: item.roles,
      canLogin: linkedUser?.canLogin ?? true,
      hasApiKey: !!linkedUser?.apiKey,
      userId: linkedUser?.id ?? null,
      username: linkedUser?.username ?? null,
      // Backward-compat boolean fields
      isWorkListAdmin: rrs.some((rr: any) => rr.resource.key === "system" && rr.role.key === "admin"),
      canAccessHR: rrs.some((rr: any) => rr.resource.key === "people" && rr.role.key === "access"),
      // New: resource+role pairs as resourceRoles for UX compatibility
      resourceRoles: rrs,
      // Granted resource+role keys (e.g., "system.admin", "people.access")
      permissions: rrs.map((rr) => `${rr.resource.key}.${rr.role.key}`),
    };
  });

  return NextResponse.json({ employees: result });
}

export async function PUT(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { employeeId, name, grants } = body as {
    employeeId: string;
    name: string;
    grants?: { resourceKey: string; roleKey: string; value: boolean }[];
  };

  // 查找关联用户：通过 Employee 表的 userId 关联
  const employee = await prisma.employee.findUnique({
    where: { employeeId },
    select: { userId: true },
  });
  let user = employee?.userId
    ? await prisma.user.findUnique({ where: { id: employee.userId } })
    : null;

  // 如果没有按 employeeId 找到，尝试按 name 匹配
  if (!user) {
    user = await prisma.user.findFirst({
      where: { name },
    });
    // 如果匹配到了，关联 Employee 到 User
    if (user) {
      await prisma.employee.update({
        where: { employeeId },
        data: { userId: user.id },
      });
    }
  }

  if (!user) {
    return NextResponse.json(
      { error: "未找到关联用户，该人员可能尚未注册账号" },
      { status: 404 }
    );
  }

  // Sync UserResourceRole records from grants array
  if (grants && Array.isArray(grants)) {
    for (const grant of grants) {
      const { resourceKey, roleKey, value } = grant;
      if (!resourceKey || !roleKey || typeof value !== "boolean") continue;

      const resource = await prisma.resource.findUnique({
        where: { key: resourceKey },
      });
      const role = await prisma.role.findUnique({
        where: { key: roleKey },
      });

      if (!resource || !role) continue;

      if (value) {
        // Grant: create UserResourceRole with scopeId=null (global toggle) if not exists
        const existing = await prisma.userResourceRole.findFirst({
          where: {
            userId: user.id,
            resourceId: resource.id,
            roleId: role.id,
            scopeId: null,
          },
        });
        if (!existing) {
          await prisma.userResourceRole.create({
            data: {
              userId: user.id,
              resourceId: resource.id,
              roleId: role.id,
              scopeId: null,
            },
          });
        }
      } else {
        // Revoke: delete UserResourceRole if exists
        await prisma.userResourceRole.deleteMany({
          where: {
            userId: user.id,
            resourceId: resource.id,
            roleId: role.id,
            scopeId: null,
          },
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
