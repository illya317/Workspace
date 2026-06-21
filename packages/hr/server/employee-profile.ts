import { formatDepartmentPath } from "@workspace/hr/utils/department-path";
import { prisma } from "@workspace/platform/server/prisma";
import { buildContractRows } from "./contracts";

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function findPrimaryContractCompany(
  contracts: Array<{ employmentId?: number; company?: string | null; isPrimary?: boolean }>,
  employmentId?: number,
) {
  const scoped = employmentId ? contracts.filter((contract) => contract.employmentId === employmentId) : contracts;
  return (
    scoped.find((contract) => contract.isPrimary && contract.company)?.company ??
    scoped.find((contract) => contract.company)?.company ??
    null
  );
}

export function employeeWhereFromKey(key: string) {
  const value = decodeURIComponent(key).trim();
  if (/^\d{5}$/.test(value)) return { employeeId: value };
  const numericId = Number(value);
  if (Number.isInteger(numericId) && numericId > 0) return { id: numericId };
  return null;
}

export async function getEmployeeProfileByKey(key: string) {
  const where = employeeWhereFromKey(key);
  if (!where) return { status: "invalid" as const };

  const employee = await prisma.employee.findUnique({
    where,
    include: { user: { select: { id: true, name: true, username: true } } },
  });
  if (!employee) return { status: "not_found" as const };
  const employeeId = employee.id;

  const [employments, edps, employeeProjects] = await Promise.all([
    prisma.employment.findMany({
      where: { employeeId },
      orderBy: [{ isActive: "desc" }, { id: "desc" }],
      include: { employee: { select: { employeeId: true, name: true } } },
    }),
    prisma.eDP.findMany({
      where: { employeeId },
      include: {
        department: {
          select: {
            id: true,
            code: true,
            name: true,
            parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
          },
        },
        position: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    }),
    prisma.employeeProject.findMany({
      where: { employeeId },
      include: { project: { select: { id: true, name: true, type: true } } },
      orderBy: { id: "asc" },
    }),
  ]);

  const contracts = buildContractRows(
    employments.map((employment) => ({
      id: employment.id,
      contracts: employment.contracts,
      employee: employment.employee,
    })),
  );

  const activeEmployment = employments.find((item) => item.isActive) ?? employments[0] ?? null;
  const currentCompany =
    findPrimaryContractCompany(contracts, activeEmployment?.id) ??
    findPrimaryContractCompany(contracts) ??
    activeEmployment?.currentCompany ??
    null;
  const primaryEdp =
    edps.find((item) => item.isPrimary && !item.endDate) ??
    edps.find((item) => !item.endDate) ??
    edps[0] ??
    null;
  const reportToEmployeeIds = Array.from(new Set(
    edps
      .map((edp) => edp.reportTo?.trim())
      .filter((value): value is string => typeof value === "string" && /^\d{5}$/.test(value)),
  ));
  const reportToEmployees = reportToEmployeeIds.length > 0
    ? await prisma.employee.findMany({
        where: { employeeId: { in: reportToEmployeeIds } },
        select: { employeeId: true, name: true },
      })
    : [];
  const reportToNameByEmployeeId = new Map(reportToEmployees.map((item) => [item.employeeId, item.name]));

  return {
    status: "ok" as const,
    data: {
      employee: {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        alias: employee.alias,
        gender: employee.gender,
        birthDate: employee.birthDate,
        ethnicity: employee.ethnicity,
        hometown: employee.hometown,
        politics: employee.politics,
        education: employee.education,
        title: employee.title,
        school: employee.school,
        major: employee.major,
        phone: employee.phone,
        workStartDate: employee.workStartDate,
        idNumber: employee.idNumber,
        otherId: employee.otherId,
        userId: employee.userId,
        userName: employee.user?.name ?? null,
        username: employee.user?.username ?? null,
      },
      summary: {
        status: activeEmployment?.isActive ? "在职" : "离职",
        currentCompany,
        departmentId: primaryEdp?.departmentId ?? null,
        departmentName: primaryEdp?.department?.name ?? null,
        positionId: primaryEdp?.positionId ?? null,
        positionName: primaryEdp?.position?.name ?? null,
      },
      employments: employments.map((employment) => ({
        id: employment.id,
        employeeId: employment.employeeId,
        isActive: employment.isActive,
        currentCompany: findPrimaryContractCompany(contracts, employment.id) ?? employment.currentCompany,
        joinDate: employment.joinDate,
        leaveDate: employment.leaveDate,
        leaveReason: employment.leaveReason,
        leaveNote: employment.leaveNote,
        officeLocation: employment.officeLocation,
        personnelType: employment.personnelType,
        rank: employment.rank,
        title: employment.title,
      })),
      contracts,
      edps: edps.map((edp) => ({
        id: edp.id,
        employeeId: edp.employeeId,
        departmentId: edp.departmentId,
        departmentName: edp.department?.name ?? null,
        departmentPath: formatDepartmentPath(edp.department) || edp.department?.name || null,
        positionId: edp.positionId,
        positionName: edp.position?.name ?? null,
        isPrimary: edp.isPrimary,
        startDate: edp.startDate,
        endDate: edp.endDate,
        reportTo: reportToNameByEmployeeId.get(edp.reportTo ?? "") ?? edp.reportTo,
        workPercent: edp.workPercent,
      })),
      employeeProjects: employeeProjects.map((entry) => ({
        id: entry.id,
        employeeId: entry.employeeId,
        projectId: entry.projectId,
        projectName: entry.project?.name ?? null,
        projectType: entry.project?.type ?? null,
        role: entry.role,
        startDate: entry.startDate,
        endDate: entry.endDate,
        createdAt: serializeDate(entry.createdAt),
        updatedAt: serializeDate(entry.updatedAt),
      })),
    },
  };
}
