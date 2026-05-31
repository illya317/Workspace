import { prisma } from "@/lib/prisma";
import { isPharma } from "@/lib/company";

interface EmployeeRole {
  company: string | null;
  dept1: string | null;
  position: string | null;
}

interface EmployeePermission {
  employeeId: string;
  name: string;
  roles: EmployeeRole[];
  canLogin: boolean;
  hasApiKey: boolean;
  userId: number | null;
  username: string | null;
  isWorkListAdmin: boolean;
  canAccessHR: boolean;
  canEditHR: boolean;
  canDeleteHR: boolean;
  resourceRoles: Array<{
    resource: { key: string; name: string };
    role: { key: string; name: string };
  }>;
  permissions: string[];
}

export async function getEmployeesWithPermissions(): Promise<EmployeePermission[]> {
  const activeEmpIds = new Set(
    (await prisma.employment.findMany({
      where: { isActive: true },
      select: { employeeId: true },
    })).map((e) => e.employeeId)
  );

  const employees = await prisma.employee.findMany({
    where: { id: { in: [...activeEmpIds] } },
    orderBy: [{ employeeId: "asc" }],
    include: {
      positions: {
        include: {
          department: { select: { name: true, code: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  const mergedMap = new Map<
    string,
    { employeeId: string; name: string; roles: EmployeeRole[] }
  >();

  for (const emp of employees) {
    const key = emp.employeeId;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, { employeeId: emp.employeeId, name: emp.name, roles: [] });
    }
    const item = mergedMap.get(key)!;
    if (emp.positions.length === 0) {
      item.roles.push({ company: null, dept1: null, position: null });
    } else {
      for (const pos of emp.positions) {
        const company: string | null = isPharma(pos.department?.code || "") ? "丰华制药" : "丰华生物";
        item.roles.push({
          company,
          dept1: pos.department?.name || null,
          position: pos.position?.name || null,
        });
      }
    }
  }

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

  const employeesForLink = await prisma.employee.findMany({
    where: { userId: { not: null } },
    select: { employeeId: true, userId: true },
  });
  const employeeIdByUserId = new Map(
    employeesForLink.filter((e) => e.userId).map((e) => [e.userId!, e.employeeId])
  );

  const userByEmployeeId = new Map(
    users.filter((u) => employeeIdByUserId.has(u.id)).map((u) => [employeeIdByUserId.get(u.id)!, u])
  );
  const userByName = new Map(users.map((u) => [u.name, u]));

  return Array.from(mergedMap.values()).map((item) => {
    const linkedUser = userByEmployeeId.get(item.employeeId) || userByName.get(item.name);
    const rrs = linkedUser?.resourceRoles ?? [];
    return {
      employeeId: item.employeeId,
      name: item.name,
      roles: item.roles,
      canLogin: linkedUser?.canLogin ?? true,
      hasApiKey: !!linkedUser?.apiKey,
      userId: linkedUser?.id ?? null,
      username: linkedUser?.username ?? null,
      isWorkListAdmin: rrs.some((rr) => rr.resource.key === "system" && rr.role.key === "admin"),
      canAccessHR: rrs.some((rr) =>
        (rr.resource.key === "people" || rr.resource.key.startsWith("people.")) &&
        rr.role.key === "access",
      ),
      canEditHR: rrs.some((rr) =>
        (rr.resource.key === "people" || rr.resource.key.startsWith("people.")) &&
        (rr.role.key === "write" || rr.role.key === "delete" || rr.role.key === "admin"),
      ) || rrs.some((rr) => rr.resource.key === "system" && rr.role.key === "admin"),
      canDeleteHR: rrs.some((rr) =>
        (rr.resource.key === "people" || rr.resource.key.startsWith("people.")) &&
        (rr.role.key === "delete" || rr.role.key === "admin"),
      ) || rrs.some((rr) => rr.resource.key === "system" && rr.role.key === "admin"),
      resourceRoles: rrs,
      permissions: rrs.map((rr) => `${rr.resource.key}.${rr.role.key}`),
    };
  });
}

interface Grant {
  resourceKey: string;
  roleKey: string;
  value: boolean;
}

export async function syncUserGrants(employeeId: string, name: string, grants?: Grant[]) {
  const employee = await prisma.employee.findUnique({
    where: { employeeId },
    select: { userId: true },
  });

  let user = employee?.userId
    ? await prisma.user.findUnique({ where: { id: employee.userId } })
    : null;

  if (!user) {
    user = await prisma.user.findFirst({ where: { name } });
    if (user) {
      await prisma.employee.update({
        where: { employeeId },
        data: { userId: user.id },
      });
    }
  }

  if (!user) {
    return { success: false, error: "未找到关联用户，该人员可能尚未注册账号", status: 404 };
  }

  if (grants && Array.isArray(grants)) {
    for (const grant of grants) {
      const { resourceKey, roleKey, value } = grant;
      if (!resourceKey || !roleKey || typeof value !== "boolean") continue;

      const resource = await prisma.resource.findUnique({ where: { key: resourceKey } });
      const role = await prisma.role.findUnique({ where: { key: roleKey } });

      if (!resource || !role) continue;

      if (value) {
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

  return { success: true };
}
