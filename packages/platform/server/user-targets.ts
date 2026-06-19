import { authorize } from "./auth";
import { prisma } from "./prisma";

interface TargetInfo {
  id: number;
  name: string;
  company?: string | null;
  type?: string;
  code?: string;
}

export async function getUserTargets(userId: number): Promise<{
  departments: TargetInfo[];
  projects: TargetInfo[];
  positions: TargetInfo[];
  users: TargetInfo[];
}> {
  const isWorkAdmin = await authorize({ user: userId, resourceKey: "work", action: "admin" });
  if (isWorkAdmin) {
    const [departments, projects, positions, users] = await Promise.all([
      prisma.department.findMany({ select: { id: true, name: true, code: true } }),
      prisma.project.findMany({ select: { id: true, name: true, type: true } }),
      prisma.position.findMany({ select: { id: true, code: true, name: true } }),
      prisma.user.findMany({
        where: { employees: { some: { employments: { some: { isActive: true } } } } },
        select: { id: true, name: true },
      }),
    ]);
    return {
      departments,
      projects,
      positions,
      users: users.map((user) => ({ id: user.id, name: user.name || `用户#${user.id}` })),
    };
  }

  const deptMap = new Map<number, TargetInfo>();
  const projMap = new Map<number, TargetInfo>();
  const posMap = new Map<number, TargetInfo>();
  const userMap = new Map<number, TargetInfo>();

  const employees = await prisma.employee.findMany({ where: { userId }, select: { id: true, name: true } });
  const employeeIds = employees.map((employee) => employee.id);

  if (employeeIds.length > 0) {
    const [eps, empProjects] = await Promise.all([
      prisma.eDP.findMany({
        where: { employeeId: { in: employeeIds } },
        select: {
          department: { select: { id: true, name: true, code: true } },
          position: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.employeeProject.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { project: { select: { id: true, name: true, type: true } } },
      }),
    ]);

    for (const ep of eps) {
      if (ep.department?.id) deptMap.set(ep.department.id, ep.department);
      if (ep.position?.id) posMap.set(ep.position.id, ep.position);
    }
    for (const ep of empProjects) projMap.set(ep.project.id, ep.project);

    const [deptAssigns, projAssigns] = await Promise.all([
      prisma.departmentWorkAssignee.findMany({
        where: { userId },
        select: { departmentId: true },
      }),
      prisma.projectWorkAssignee.findMany({
        where: { userId },
        select: { projectId: true },
      }),
    ]);

    if (deptAssigns.length > 0) {
      const depts = await prisma.department.findMany({
        where: { id: { in: deptAssigns.map((assignee) => assignee.departmentId) } },
        select: { id: true, name: true, code: true },
      });
      for (const department of depts) deptMap.set(department.id, department);
    }
    if (projAssigns.length > 0) {
      const projs = await prisma.project.findMany({
        where: { id: { in: projAssigns.map((assignee) => assignee.projectId) } },
        select: { id: true, name: true, type: true },
      });
      for (const project of projs) projMap.set(project.id, project);
    }

    for (const employee of employees) {
      userMap.set(userId, { id: userId, name: `${employee.name}（个人）` });
    }
  }

  return {
    departments: Array.from(deptMap.values()),
    projects: Array.from(projMap.values()),
    positions: Array.from(posMap.values()),
    users: Array.from(userMap.values()),
  };
}
