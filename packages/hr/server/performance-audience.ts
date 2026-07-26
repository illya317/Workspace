import type { PeriodDossierModel } from "@workspace/platform/period-dossier";
import { getOperatingCommitteeDepartmentContext } from "@workspace/platform/server/business-space-permissions";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
export {
  resolveHrPerformanceDashboardProjection,
  selectHrPerformanceAudience,
  type HrPerformanceDashboardView,
  type HrPerformanceAudienceType,
} from "./performance-audience-selection";
import type { HrPerformanceAudienceType } from "./performance-audience-selection";

const employeeInclude = {
  employments: { where: currentEmploymentDateWhere(), orderBy: { id: "desc" as const }, take: 1 },
  positions: {
    where: currentOpenEndedDateWhere(),
    include: { department: true, position: true, reportingCompany: { include: { party: true } } },
    orderBy: [{ isPrimary: "desc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.EmployeeInclude;

const departmentSelect = {
  id: true,
  code: true,
  name: true,
  parentId: true,
  hierarchyKind: true,
  level: true,
  parent: { select: { name: true } },
} satisfies Prisma.DepartmentSelect;

const projectSelect = {
  id: true,
  code: true,
  name: true,
  projectType: true,
  projectLevel: true,
  leadingDepartment: { select: { name: true } },
  employees: {
    where: { recordState: "confirmed" },
    select: { employeeId: true, startDate: true, endDate: true },
  },
} satisfies Prisma.ProjectSelect;

export type HrPerformanceAudienceEmployee = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;
export type HrPerformanceAudienceDepartment = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;
export type HrPerformanceAudienceProject = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

export type HrPerformanceAudienceCatalog = {
  employees: HrPerformanceAudienceEmployee[];
  departments: HrPerformanceAudienceDepartment[];
  projects: HrPerformanceAudienceProject[];
};

export type HrPerformanceContributionTarget = {
  audienceType: HrPerformanceAudienceType;
  audienceId: number;
  targetType: HrPerformanceAudienceType;
  targetId: number;
  employeeId: number | null;
  subject: PeriodDossierModel["subject"];
};

export async function loadHrPerformanceAudienceCatalog(input: {
  employeeIds?: readonly number[] | null;
  includeDirectories?: boolean;
} = {}): Promise<HrPerformanceAudienceCatalog> {
  const includeDirectories = input.includeDirectories !== false;
  const employeeIds = input.employeeIds === undefined || input.employeeIds === null
    ? null
    : Array.from(new Set(input.employeeIds.filter((id) => Number.isInteger(id) && id > 0)));
  const operatingCommittee = includeDirectories ? await getOperatingCommitteeDepartmentContext() : null;
  const [employees, departments, projects] = await Promise.all([
    prisma.employee.findMany({
      where: {
        employments: { some: currentEmploymentDateWhere() },
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
      },
      include: employeeInclude,
      orderBy: { employeeId: "asc" },
    }),
    includeDirectories ? prisma.department.findMany({
      where: {
        isArchived: false,
        OR: [
          { hierarchyKind: "M" },
          ...(operatingCommittee ? [{ id: operatingCommittee.id }] : []),
        ],
      },
      select: departmentSelect,
      orderBy: [{ hierarchyKind: "asc" }, { level: "asc" }, { code: "asc" }, { id: "asc" }],
    }) : Promise.resolve([]),
    includeDirectories ? prisma.project.findMany({
      where: { isArchived: false, workspaceEnabled: true },
      select: projectSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }) : Promise.resolve([]),
  ]);
  return { employees, departments, projects };
}

export async function getHrPerformanceEmployeeIdentity(employeeId: number) {
  return prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, employeeId: true, name: true, userId: true },
  });
}

export async function resolveHrPerformanceContributionTarget(
  audienceType: HrPerformanceAudienceType,
  audienceId: number,
): Promise<HrPerformanceContributionTarget | null> {
  if (audienceType === "personal") {
    const employee = await prisma.employee.findFirst({
      where: {
        id: audienceId,
        userId: { not: null },
        employments: { some: currentEmploymentDateWhere() },
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        userId: true,
        positions: {
          where: currentOpenEndedDateWhere(),
          select: {
            isPrimary: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
            reportingCompany: { select: { party: { select: { name: true } } } },
          },
          orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
          take: 1,
        },
      },
    });
    if (!employee?.userId) return null;
    const position = employee.positions[0];
    return {
      audienceType,
      audienceId,
      targetType: "personal",
      targetId: employee.userId,
      employeeId: employee.id,
      subject: {
        kind: "personal",
        id: employee.id,
        code: employee.employeeId,
        name: employee.name,
        meta: [
          { label: "公司", value: position?.reportingCompany?.party.name || "" },
          { label: "部门", value: position?.department?.name || "" },
          { label: "岗位", value: position?.position?.name || "" },
        ],
      },
    };
  }

  if (audienceType === "department") {
    const [department, operatingCommittee] = await Promise.all([
      prisma.department.findFirst({ where: { id: audienceId, isArchived: false }, select: departmentSelect }),
      getOperatingCommitteeDepartmentContext(),
    ]);
    if (!department || (department.hierarchyKind !== "M" && department.id !== operatingCommittee?.id)) return null;
    return {
      audienceType,
      audienceId,
      targetType: "department",
      targetId: department.id,
      employeeId: null,
      subject: {
        kind: "department",
        id: department.id,
        code: department.code,
        name: department.name,
        meta: [
          { label: "层级", value: `${department.hierarchyKind}${department.level}` },
          { label: "上级组织", value: department.parent?.name || "" },
        ],
      },
    };
  }

  const project = await prisma.project.findFirst({
    where: { id: audienceId, isArchived: false, workspaceEnabled: true },
    select: projectSelect,
  });
  if (!project) return null;
  return {
    audienceType,
    audienceId,
    targetType: "project",
    targetId: project.id,
    employeeId: null,
    subject: {
      kind: "project",
      id: project.id,
      code: project.code || "",
      name: project.name,
      meta: [
        { label: "项目类型", value: project.projectType },
        { label: "项目级别", value: project.projectLevel },
        { label: "牵头部门", value: project.leadingDepartment?.name || "" },
      ],
    },
  };
}
