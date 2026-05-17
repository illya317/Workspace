import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Map old User boolean fields to new Permission keys
const FIELD_TO_PERM_KEY: Record<string, string> = {
  isWorkListAdmin: "system.admin",
  canSelectAnyWeek: "system.any_week",
  canAccessHR: "module.hr",
  canAccessWorks: "module.works",
  canLogin: "system.login",
};

export async function GET(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  // 获取所有员工（含岗位信息）
  const employees = await prisma.employee.findMany({
    orderBy: [{ employeeId: "asc" }],
    include: {
      positions: {
        include: {
          department: { select: { name: true, company: true } },
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
      roles: { company: string | null; dept1: string | null; position: string | null }[];
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
      item.roles.push({ company: null, dept1: null, position: null });
    } else {
      for (const pos of emp.positions) {
        item.roles.push({
          company: pos.department?.company || null,
          dept1: pos.department?.name || null,
          position: pos.position?.name || null,
        });
      }
    }
  }

  // 获取所有用户权限数据
  const users = await prisma.user.findMany({
    select: {
      id: true,
      employeeId: true,
      name: true,
      username: true,
      canSelectAnyWeek: true,
      canAccessWorks: true,
      canLogin: true,
      isWorkListAdmin: true,
      canAccessHR: true,
      apiKey: true,
      // Include new UserPermission data
      permissions: {
        select: {
          permission: {
            select: { key: true, name: true },
          },
        },
      },
    },
  });

  const userByEmployeeId = new Map(
    users.filter((u) => u.employeeId).map((u) => [u.employeeId, u])
  );
  const userByName = new Map(users.map((u) => [u.name, u]));

  const result = Array.from(mergedMap.values()).map((item) => {
    const linkedUser =
      userByEmployeeId.get(item.employeeId) || userByName.get(item.name);
    return {
      employeeId: item.employeeId,
      name: item.name,
      roles: item.roles,
      canSelectAnyWeek: linkedUser?.canSelectAnyWeek ?? false,
      canAccessWorks: linkedUser?.canAccessWorks ?? true,
      canLogin: linkedUser?.canLogin ?? true,
      isWorkListAdmin: linkedUser?.isWorkListAdmin ?? false,
      canAccessHR: linkedUser?.canAccessHR ?? false,
      hasApiKey: !!linkedUser?.apiKey,
      userId: linkedUser?.id ?? null,
      username: linkedUser?.username ?? null,
      // New: granted permission keys
      permissions: linkedUser?.permissions?.map((p) => p.permission.key) ?? [],
    };
  });

  return NextResponse.json({ employees: result });
}

export async function PUT(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const {
    employeeId,
    name,
    canSelectAnyWeek,
    canAccessWorks,
    canLogin,
    isWorkListAdmin,
    canAccessHR,
  } = body as {
    employeeId: string;
    name: string;
    canSelectAnyWeek?: boolean;
    canAccessWorks?: boolean;
    canLogin?: boolean;
    isWorkListAdmin?: boolean;
    canAccessHR?: boolean;
  };

  // 查找关联用户
  let user = await prisma.user.findFirst({
    where: { employeeId },
  });

  // 如果没有按 employeeId 找到，尝试按 name 匹配
  if (!user) {
    user = await prisma.user.findFirst({
      where: { name },
    });
    // 如果匹配到了，设置 employeeId
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { employeeId },
      });
    }
  }

  if (!user) {
    return NextResponse.json(
      { error: "未找到关联用户，该人员可能尚未注册账号" },
      { status: 404 }
    );
  }

  // 1. Update old User booleans for backward compat
  const data: Record<string, boolean> = {};
  if (typeof canSelectAnyWeek === "boolean") data.canSelectAnyWeek = canSelectAnyWeek;
  if (typeof canAccessWorks === "boolean") data.canAccessWorks = canAccessWorks;
  if (typeof canLogin === "boolean") data.canLogin = canLogin;
  if (typeof isWorkListAdmin === "boolean") data.isWorkListAdmin = isWorkListAdmin;
  if (typeof canAccessHR === "boolean") data.canAccessHR = canAccessHR;

  await prisma.user.update({
    where: { id: user.id },
    data,
  });

  // 2. Sync new UserPermission records
  const fieldValues: Record<string, boolean | undefined> = {
    isWorkListAdmin,
    canSelectAnyWeek,
    canAccessWorks,
    canLogin,
    canAccessHR,
  };

  for (const [field, value] of Object.entries(fieldValues)) {
    if (typeof value !== "boolean") continue;

    const permKey = FIELD_TO_PERM_KEY[field];
    if (!permKey) continue;

    const perm = await prisma.permission.findUnique({
      where: { key: permKey },
    });

    if (!perm) continue; // Permission table not seeded yet — skip

    if (value) {
      // Grant: upsert UserPermission
      await prisma.userPermission.upsert({
        where: {
          userId_permissionId: { userId: user.id, permissionId: perm.id },
        },
        create: {
          userId: user.id,
          permissionId: perm.id,
        },
        update: {},
      });
    } else {
      // Revoke: delete UserPermission if exists
      await prisma.userPermission.deleteMany({
        where: { userId: user.id, permissionId: perm.id },
      });
    }
  }

  return NextResponse.json({ success: true });
}
