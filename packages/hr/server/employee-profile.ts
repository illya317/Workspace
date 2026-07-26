import { prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import { buildContractRows } from "./contracts";
import { employeeWhereFromKey } from "./employee-profile-key";

export { employeeWhereFromKey } from "./employee-profile-key";

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

async function findCompanyByNameOrCode(value: string | null) {
  const text = value?.trim();
  if (!text) return null;
  return prisma.company.findFirst({
    where: { OR: [{ code: text }, { party: { name: text } }, { party: { fullName: text } }] },
    select: { id: true, party: { select: { name: true } } },
  }).then((company) => company ? { id: company.id, name: company.party.name } : null);
}

export async function getEmployeeProfileByKey(key: string) {
  const where = employeeWhereFromKey(key);
  if (!where) return { status: "invalid" as const };

  const employee = await prisma.employee.findUnique({
    where,
    include: { user: { select: { id: true, username: true } } },
  });
  if (!employee) return { status: "not_found" as const };
  const employeeId = employee.id;

  const [employments, edps, lifecycleEvents] = await Promise.all([
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
        reportingCompany: { select: { id: true, code: true, party: { select: { name: true } } } },
        reportToPosition: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    }),
    prisma.employeeLifecycleEvent.findMany({
      where: { employeeId },
      include: { recordedBy: { select: { username: true, employees: { select: { name: true }, take: 1 } } } },
      orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);

  const contracts = buildContractRows(
    employments.map((employment) => ({
      id: employment.id,
      contracts: employment.contracts,
      employee: employment.employee,
    })),
  );

  const businessDate = workspaceBusinessDate(new Date());
  const activeEmployment = employments.find((item) => employmentIsActiveOnDate(item, businessDate)) ?? null;
  const currentCompany =
    findPrimaryContractCompany(contracts, activeEmployment?.id) ??
    findPrimaryContractCompany(contracts) ??
    activeEmployment?.currentCompany ??
    null;
  const reportingCompany = await findCompanyByNameOrCode(currentCompany);
  const activeEdps = edps.filter((item) => (
    (!item.startDate || item.startDate <= businessDate)
    && (!item.endDate || item.endDate >= businessDate)
  ));
  const primaryEdp = activeEdps.find((item) => item.isPrimary) ?? activeEdps[0] ?? null;
  const parsedLifecycleEvents = lifecycleEvents.map((event) => ({ event, details: parseLifecycleDetails(event.detailsJson) }));
  const cancelledAssignmentIds = new Set(parsedLifecycleEvents.flatMap(({ details }) => numberArray(details.cancelledAssignmentIds)));

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
        userName: employee.user ? employee.name : null,
        username: employee.user?.username ?? null,
      },
      summary: {
        status: activeEmployment
          ? "在职"
          : employments.some((item) => item.joinDate && item.joinDate > businessDate)
            ? "待入职"
            : "离职",
        currentCompany,
        reportingCompanyId: reportingCompany?.id ?? null,
        reportingCompanyName: reportingCompany?.name ?? currentCompany,
        departmentId: primaryEdp?.departmentId ?? null,
        departmentName: primaryEdp?.department?.name ?? null,
        departmentPath: primaryEdp?.department?.name ?? null,
        positionId: primaryEdp?.positionId ?? null,
        positionName: primaryEdp?.position?.name ?? null,
      },
      employments: employments.map((employment) => ({
        id: employment.id,
        employeeId: employment.employeeId,
        isActive: employmentIsActiveOnDate(employment, businessDate),
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
        reportingCompanyId: edp.reportingCompanyId,
        reportingCompanyName: edp.reportingCompany?.party.name ?? null,
        departmentId: edp.departmentId,
        departmentName: edp.department?.name ?? null,
        departmentPath: edp.department?.name ?? null,
        positionId: edp.positionId,
        positionReportOverrideId: edp.positionReportOverrideId,
        positionName: edp.position?.name ?? null,
        isPrimary: edp.isPrimary,
        startDate: edp.startDate,
        endDate: edp.endDate,
        reportToPositionId: edp.reportToPositionId,
        reportTo: edp.reportToPosition?.name ?? null,
        workPercent: edp.workPercent,
      })),
      lifecycleEvents: parsedLifecycleEvents.map(({ event, details }) => ({
        id: event.id,
        eventType: event.eventType,
        effectiveDate: event.effectiveDate,
        status: lifecycleEventStatus(event.effectiveDate, details, cancelledAssignmentIds, businessDate),
        reason: event.reason,
        details,
        recordedByUserId: event.recordedByUserId,
        recordedByName: event.recordedBy.employees[0]?.name || event.recordedBy.username,
        recordedAt: event.recordedAt.toISOString(),
      })),
    },
  };
}

function parseLifecycleDetails(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : [];
}

function lifecycleEventStatus(
  effectiveDate: string,
  details: Record<string, unknown>,
  cancelledAssignmentIds: Set<number>,
  businessDate: string,
) {
  if (effectiveDate <= businessDate) return "effective" as const;
  const createdIds = numberArray(details.createdAssignmentIds);
  if (createdIds.length > 0 && createdIds.every((id) => cancelledAssignmentIds.has(id))) return "cancelled" as const;
  return "scheduled" as const;
}
