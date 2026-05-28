import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGrants } from "@/server/rbac/grants";
import { getResourceAncestors } from "@/server/rbac/resource";
import { getManageableResourceKeys, canManageResourceGrant } from "@/server/rbac/admin-scope";
import type { SubjectType } from "@/server/rbac/grants";

interface SubjectInfo {
  id: number;
  name: string;
  extra?: Record<string, unknown>;
}

async function buildDeptPathMaps() {
  const allDepts = await prisma.department.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const parentMap = new Map<number, number | null>(allDepts.map((d) => [d.id, d.parentId]));
  const nameMap = new Map<number, string>(allDepts.map((d) => [d.id, d.name]));

  function getDeptPath(deptId: number | null): string[] {
    const path: string[] = [];
    const seen = new Set<number>();
    let current = deptId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const name = nameMap.get(current);
      if (name) path.unshift(name);
      current = parentMap.get(current) ?? null;
    }
    return path;
  }

  return { getDeptPath };
}

async function getUserSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();

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
          department: { select: { name: true, code: true, id: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  const employeeUsers = await prisma.employee.findMany({
    where: { userId: { not: null } },
    select: { employeeId: true, userId: true },
  });
  const userIdByEmployeeId = new Map(
    employeeUsers.map((e) => [e.employeeId, e.userId!])
  );

  const result: SubjectInfo[] = [];
  for (const emp of employees) {
    const userId = userIdByEmployeeId.get(emp.employeeId);
    const dept = emp.positions[0]?.department;
    const companyName = dept?.code?.startsWith("PPA") || dept?.code?.startsWith("04")
      ? "丰华制药"
      : "丰华生物";

    result.push({
      id: userId ?? 0,
      name: emp.name,
      extra: {
        employeeId: emp.employeeId,
        userId,
        hasUser: !!userId,
        company: companyName,
        department: dept?.name || "",
        deptPath: getDeptPath(dept?.id ?? null),
        positionIds: emp.positions.map((p) => p.positionId).filter((id): id is number => id !== null),
        departmentIds: [...new Set(emp.positions.map((p) => p.departmentId).filter((id): id is number => id !== null))],
      },
    });
  }
  return result;
}

async function getPositionSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();

  const positions = await prisma.position.findMany({
    include: {
      department: { select: { name: true, code: true, id: true } },
    },
    orderBy: { code: "asc" },
  });

  const result: SubjectInfo[] = [];
  for (const pos of positions) {
    const dept = pos.department;
    const companyName = dept?.code?.startsWith("PPA") || dept?.code?.startsWith("04")
      ? "丰华制药"
      : "丰华生物";

    result.push({
      id: pos.id,
      name: pos.name,
      extra: {
        code: pos.code,
        company: companyName,
        department: dept?.name || "",
        deptPath: getDeptPath(dept?.id ?? null),
      },
    });
  }
  return result;
}

async function getDepartmentSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();

  const depts = await prisma.department.findMany({
    orderBy: { code: "asc" },
  });

  const result: SubjectInfo[] = [];
  for (const d of depts) {
    const companyName = d.code?.startsWith("PPA") || d.code?.startsWith("04")
      ? "丰华制药"
      : "丰华生物";

    result.push({
      id: d.id,
      name: d.name,
      extra: {
        code: d.code,
        company: companyName,
        deptPath: getDeptPath(d.id),
      },
    });
  }
  return result;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
  const manageableKeys = await getManageableResourceKeys(payload.userId);

  if (!isSysAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subjectType = (searchParams.get("subjectType") || "user") as SubjectType;
  const resourceKey = searchParams.get("resourceKey") || undefined;

  // Non-system-admin must provide a resourceKey and it must be manageable
  if (!isSysAdmin) {
    if (!resourceKey) {
      return NextResponse.json({ error: "需要指定 resourceKey" }, { status: 400 });
    }
    if (!manageableKeys.has(resourceKey)) {
      return NextResponse.json({ error: "无权限管理该资源" }, { status: 403 });
    }
  }

  let subjects: SubjectInfo[] = [];
  if (subjectType === "user") {
    subjects = await getUserSubjects();
  } else if (subjectType === "position") {
    subjects = await getPositionSubjects();
  } else if (subjectType === "department") {
    subjects = await getDepartmentSubjects();
  }

  // Load direct grants for this subject type
  const directGrants = await getGrants(subjectType);

  // If a specific resource is selected, also load position/department grants
  // for user subjects so frontend can compute inheritance
  let positionGrants: Awaited<ReturnType<typeof getGrants>> = [];
  let departmentGrants: Awaited<ReturnType<typeof getGrants>> = [];

  if (subjectType === "user") {
    positionGrants = await getGrants("position");
    departmentGrants = await getGrants("department");
  }

  // Build ancestor map for resource inheritance
  let ancestorResourceIds: number[] = [];
  if (resourceKey) {
    const resource = await prisma.resource.findUnique({
      where: { key: resourceKey },
      select: { id: true },
    });
    if (resource) {
      ancestorResourceIds = await getResourceAncestors(resource.id);
    }
  }

  const ancestorResourceKeys = resourceKey
    ? (await prisma.resource.findMany({
        where: { id: { in: ancestorResourceIds } },
        select: { key: true },
      })).map((r) => r.key)
    : [];

  return NextResponse.json({
    subjects,
    directGrants,
    positionGrants,
    departmentGrants,
    ancestorResourceKeys,
  });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();
  const { subjectType, subjectId, resourceKey, roleKey, value } = body;

  if (!subjectType || !subjectId || !resourceKey || !roleKey || typeof value !== "boolean") {
    return NextResponse.json(
      { error: "参数错误: 需要 subjectType, subjectId, resourceKey, roleKey, value" },
      { status: 400 }
    );
  }

  const canManage = await canManageResourceGrant(payload.userId, resourceKey, roleKey);
  if (!canManage) {
    return NextResponse.json({ error: "无权限管理该资源权限" }, { status: 403 });
  }

  try {
    const { setGrant } = await import("@/server/rbac/grants");
    await setGrant(subjectType as SubjectType, subjectId, resourceKey, roleKey, value, {
      actorUserId: payload.userId,
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "操作失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
