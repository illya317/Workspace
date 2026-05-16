import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  // 获取所有员工，按 name + employeeId 去重（合并多岗）
  const employees = await prisma.employee.findMany({
    orderBy: [{ employeeId: "asc" }],
  });

  // 合并多岗人员，保留每个角色的 company/dept1/dept2/position
  const mergedMap = new Map<
    string,
    {
      employeeId: string;
      name: string;
      roles: { company: string | null; dept1: string | null; dept2: string | null; position: string | null }[];
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
    item.roles.push({
      company: emp.company,
      dept1: emp.dept1,
      dept2: emp.dept2,
      position: emp.position,
    });
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

  return NextResponse.json({ success: true });
}
