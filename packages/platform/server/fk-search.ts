import { prisma } from "./prisma";
import { workspaceBusinessDate } from "./business-date";
import {
  archivedBooleanFilter,
  currentEmploymentDateWhere,
  employeeActiveLifecycleStatus,
  employmentIsActiveOnDate,
  matchesFkKeyword,
  type LifecycleScope,
} from "./relation-registry";

const MAX_RESULTS = 50;
const PREFETCH_LIMIT = 1000;

type DepartmentPathLike = {
  code?: string | null;
  name: string;
  parent?: (DepartmentPathLike & { parent?: DepartmentPathLike | null }) | null;
} | null;

function resultLimit(keyword: string) {
  return keyword.length > 3 ? MAX_RESULTS : PREFETCH_LIMIT;
}

function formatDepartmentPath(department: DepartmentPathLike) {
  if (!department) return "";
  return [department.parent?.parent?.name, department.parent?.name, department.name].filter(Boolean).join(" / ");
}

function formatDepartmentCodePath(department: DepartmentPathLike) {
  if (!department) return "";
  return [department.parent?.parent?.code, department.parent?.code, department.code].filter(Boolean).join("/");
}

export async function searchFkDepartments(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.department.findMany({
    where: archivedBooleanFilter(lifecycleScope),
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
    },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      departmentPath: row.name,
      searchPath: formatDepartmentPath(row) || row.name,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle, row.searchPath], keyword))
    .map(({ searchPath: _searchPath, ...row }) => row)
    .slice(0, MAX_RESULTS);
}

export async function searchFkPositions(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.position.findMany({
    where: {
      ...archivedBooleanFilter(lifecycleScope),
      ...(lifecycleScope === "active" ? { OR: [{ departmentId: null }, { department: { isArchived: false } }] } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      departmentId: true,
      isArchived: true,
      department: {
        select: {
          code: true,
          name: true,
          parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
        },
      },
    },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => {
      const departmentName = row.department?.name ?? null;
      const searchPath = formatDepartmentPath(row.department);
      return {
        id: row.id,
        name: row.name,
        subtitle: [row.code, formatDepartmentCodePath(row.department)].filter(Boolean).join(" · "),
        departmentId: row.departmentId,
        departmentPath: departmentName,
        searchPath,
        lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
      };
    })
    .filter((row) => matchesFkKeyword([row.name, row.subtitle, row.searchPath], keyword))
    .map(({ searchPath: _searchPath, ...row }) => row)
    .slice(0, MAX_RESULTS);
}

export async function searchFkEmployees(keyword: string, lifecycleScope: LifecycleScope) {
  const where =
    lifecycleScope === "active"
      ? { employments: { some: currentEmploymentDateWhere() } }
      : lifecycleScope === "archived"
        ? { employments: { none: currentEmploymentDateWhere() } }
        : {};
  const rows = await prisma.employee.findMany({
    where,
    select: { id: true, name: true, employeeId: true, employments: { select: { isActive: true, joinDate: true, leaveDate: true } } },
    orderBy: { employeeId: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => {
      const active = row.employments.some((employment) => employmentIsActiveOnDate(employment, workspaceBusinessDate(new Date())));
      return {
        id: row.id,
        name: row.name,
        subtitle: row.employeeId,
        lifecycleStatus: employeeActiveLifecycleStatus(active),
      };
    })
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkCompanies(keyword: string, lifecycleScope: LifecycleScope) {
  const where = lifecycleScope === "active" ? { isActive: true } : lifecycleScope === "archived" ? { isActive: false } : {};
  const rows = await prisma.company.findMany({
    where,
    select: { id: true, code: true, isActive: true, party: { select: { name: true, fullName: true } } },
    orderBy: { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .filter((row) => matchesFkKeyword([row.party.name, row.code, row.party.fullName], keyword))
    .map((row) => ({
      id: row.id,
      name: row.party.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .slice(0, MAX_RESULTS);
}

export async function searchFkParties(keyword: string) {
  const normalized = keyword.trim().toUpperCase();
  if (!normalized) return [];
  const rows = await prisma.party.findMany({
    where: {
      OR: [
        { name: { contains: keyword.trim(), mode: "insensitive" } },
        { fullName: { contains: keyword.trim(), mode: "insensitive" } },
        { identityNumber: { contains: normalized, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, subjectType: true, identityNumber: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: resultLimit(keyword),
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    subtitle: `${row.subjectType === "individual" ? "个人" : "机构"} · ***${row.identityNumber.slice(-4)}`,
    lifecycleStatus: "active" as const,
  })).slice(0, MAX_RESULTS);
}

export async function searchFkFinanceAccounts(keyword: string) {
  const rows = await prisma.financeAccount.findMany({
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkFinanceGroupAccounts(keyword: string) {
  const rows = await prisma.financeGroupAccount.findMany({
    where: { isActive: true, reviewStatus: { not: "pending_delete" } },
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkUsers(keyword: string) {
  const rows = await prisma.user.findMany({
    select: { id: true, username: true, employees: { select: { name: true, employeeId: true }, take: 1 } },
    orderBy: { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => {
      const employee = row.employees[0];
      const name = employee?.name || "未绑定员工";
      return {
        id: row.id,
        name,
        subtitle: employee?.employeeId,
        lifecycleStatus: "active" as const,
        searchText: [row.username, employee?.name, employee?.employeeId].filter(Boolean).join(" "),
      };
    })
    .filter((row) => matchesFkKeyword([row.name, row.subtitle, row.searchText], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkPositionDescriptions(keyword: string) {
  const rows = await prisma.position.findMany({
    where: { positionDescriptionId: { not: null } },
    select: { code: true, name: true, positionDescriptionId: true },
    orderBy: { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.positionDescriptionId ?? 0,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => row.id > 0)
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkMeetings(keyword: string) {
  const rows = await prisma.meeting.findMany({
    select: { id: true, title: true, startAt: true },
    orderBy: [{ startAt: "desc" }, { id: "desc" }],
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: row.startAt ? row.startAt.toISOString().slice(0, 10) : undefined,
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkMeetingDecisions(keyword: string) {
  const rows = await prisma.meetingDecision.findMany({
    select: { id: true, title: true, kind: true, meeting: { select: { title: true } } },
    orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: [row.kind, row.meeting.title].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkMeetingActionCandidates(keyword: string) {
  const rows = await prisma.meetingActionCandidate.findMany({
    select: { id: true, title: true, status: true, meeting: { select: { title: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: [row.status, row.meeting.title].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkProjects(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.project.findMany({
    where: archivedBooleanFilter(lifecycleScope),
    select: { id: true, name: true, code: true, isArchived: true },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code ?? undefined,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkProjectPlanPhases(keyword: string) {
  const rows = await prisma.projectPlanPhase.findMany({
    select: { id: true, name: true, sequenceNo: true, project: { select: { name: true, code: true } } },
    orderBy: [{ projectId: "asc" }, { sequenceNo: "asc" }, { id: "asc" }],
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: [row.project.code, row.project.name, `#${row.sequenceNo}`].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function resolveFkDepartment(id: number) {
  const row = await prisma.department.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
}

export async function resolveFkPosition(id: number) {
  const row = await prisma.position.findUnique({
    where: { id },
    select: { id: true, name: true, isArchived: true, department: { select: { isArchived: true } } },
  });
  if (!row) return null;
  return {
    id: row.id,
    label: row.name,
    lifecycleStatus: row.isArchived || row.department?.isArchived ? "archived" as const : "active" as const,
  };
}

export async function resolveFkEmployee(id: number) {
  const row = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, name: true, employments: { select: { isActive: true, joinDate: true, leaveDate: true } } },
  });
  return row
    ? { id: row.id, label: row.name, lifecycleStatus: employeeActiveLifecycleStatus(row.employments.some((employment) => employmentIsActiveOnDate(employment, workspaceBusinessDate(new Date())))) }
    : null;
}

export async function resolveFkCompany(id: number) {
  const row = await prisma.company.findUnique({ where: { id }, select: { id: true, isActive: true, party: { select: { name: true } } } });
  return row ? { id: row.id, label: row.party.name, lifecycleStatus: row.isActive ? "active" as const : "inactive" as const } : null;
}

export async function resolveFkParty(id: number) {
  const row = await prisma.party.findUnique({ where: { id }, select: { id: true, name: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: "active" as const } : null;
}

export async function resolveFkFinanceAccount(id: number) {
  const row = await prisma.financeAccount.findUnique({ where: { id }, select: { id: true, name: true, code: true, isActive: true } });
  return row
    ? { id: row.id, label: [row.code, row.name].filter(Boolean).join(" "), lifecycleStatus: row.isActive ? "active" as const : "inactive" as const }
    : null;
}

export async function resolveFkFinanceGroupAccount(id: number) {
  const row = await prisma.financeGroupAccount.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, isActive: true, reviewStatus: true },
  });
  return row
    ? {
        id: row.id,
        label: [row.code, row.name].filter(Boolean).join(" "),
        lifecycleStatus: row.isActive && row.reviewStatus !== "pending_delete" ? "active" as const : "inactive" as const,
      }
    : null;
}

export async function resolveFkUser(id: number) {
  const row = await prisma.user.findUnique({
    where: { id },
    select: { id: true, employees: { select: { name: true }, take: 1 } },
  });
  return row ? { id: row.id, label: row.employees[0]?.name || "未绑定员工", lifecycleStatus: "active" as const } : null;
}

export async function resolveFkPositionDescription(id: number) {
  const row = await prisma.position.findFirst({
    where: { positionDescriptionId: id },
    select: { positionDescriptionId: true, name: true, code: true },
  });
  return row && row.positionDescriptionId
    ? { id: row.positionDescriptionId, label: [row.code, row.name].filter(Boolean).join(" "), lifecycleStatus: "active" as const }
    : null;
}

export async function resolveFkMeeting(id: number) {
  const row = await prisma.meeting.findUnique({ where: { id }, select: { id: true, title: true } });
  return row ? { id: row.id, label: row.title, lifecycleStatus: "active" as const } : null;
}

export async function resolveFkMeetingDecision(id: number) {
  const row = await prisma.meetingDecision.findUnique({ where: { id }, select: { id: true, title: true } });
  return row ? { id: row.id, label: row.title, lifecycleStatus: "active" as const } : null;
}

export async function resolveFkMeetingActionCandidate(id: number) {
  const row = await prisma.meetingActionCandidate.findUnique({ where: { id }, select: { id: true, title: true } });
  return row ? { id: row.id, label: row.title, lifecycleStatus: "active" as const } : null;
}

export async function resolveFkProject(id: number) {
  const row = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
}

export async function resolveFkProjectPlanPhase(id: number) {
  const row = await prisma.projectPlanPhase.findUnique({ where: { id }, select: { id: true, name: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: "active" as const } : null;
}
