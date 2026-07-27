import { matchSearchFields } from "@workspace/platform/search";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { currentEmploymentDateWhere, employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import { primaryContractCompany } from "./employments";

function activeFilterValue(value: string | null | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function listEdps(input: {
  keyword: string;
  isActive?: string | null;
  company?: string;
  department?: string;
  position?: string;
  page: number;
  pageSize: number;
}) {
  const isActive = activeFilterValue(input.isActive);
  const defaultPage = !input.keyword && !input.company && !input.department && !input.position;
  if (defaultPage) {
    const where: Prisma.EDPWhereInput = isActive === null
      ? {}
      : isActive
        ? { employee: { employments: { some: currentEmploymentDateWhere() } } }
        : { employee: { employments: { none: currentEmploymentDateWhere() } } };
    const [total, edps] = await Promise.all([
      prisma.eDP.count({ where }),
      prisma.eDP.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          department: { select: { name: true } },
          position: { select: { name: true } },
          reportToPosition: { select: { name: true } },
          reportingCompany: { select: { id: true, code: true, party: { select: { name: true } } } },
        },
        orderBy: { id: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return {
      positions: edps.map((edp) => ({
        id: edp.id,
        employeeId: edp.employeeId,
        employeeName: edp.employee?.name || "",
        reportingCompanyId: edp.reportingCompanyId,
        reportingCompanyName: edp.reportingCompany?.party.name || "",
        departmentId: edp.departmentId,
        departmentName: edp.department?.name || "",
        positionId: edp.positionId,
        positionReportOverrideId: edp.positionReportOverrideId,
        positionName: edp.position?.name || "",
        isPrimary: edp.isPrimary,
        startDate: edp.startDate,
        endDate: edp.endDate,
        reportTo: edp.reportToPosition?.name ?? null,
        reportToPositionId: edp.reportToPositionId,
        allocationWeight: edp.allocationWeight,
      })),
      total,
    };
  }

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeId: true,
      name: true,
      employments: {
        select: { isActive: true, joinDate: true, leaveDate: true, currentCompany: true, contracts: true },
        orderBy: [{ isActive: "desc" }, { id: "desc" }],
      },
    },
    orderBy: { id: "asc" },
  });
  const employeeIds = employees.map((employee) => employee.id);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  const edps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    include: {
      department: { include: { parent: { include: { parent: true } } } },
      position: true,
      reportToPosition: { select: { name: true } },
      reportingCompany: { select: { id: true, code: true, party: { select: { name: true } } } },
    },
    orderBy: [{ id: "asc" }],
  });

  let rows = edps.map((edp) => {
    const employee = employeeMap.get(edp.employeeId);
    return {
      id: edp.id,
      employeeId: edp.employeeId,
      employeeName: employee?.name || "",
      employeeEmployments: employee?.employments ?? [],
      reportingCompanyId: edp.reportingCompanyId,
      reportingCompanyName: edp.reportingCompany?.party.name || "",
      departmentId: edp.departmentId,
      departmentName: edp.department?.name || "",
      positionId: edp.positionId,
      positionReportOverrideId: edp.positionReportOverrideId,
      positionName: edp.position?.name || "",
      isPrimary: edp.isPrimary,
      startDate: edp.startDate,
      endDate: edp.endDate,
      reportTo: edp.reportToPosition?.name ?? null,
      reportToPositionId: edp.reportToPositionId,
      allocationWeight: edp.allocationWeight,
    };
  });

  if (isActive !== null) {
    const today = workspaceBusinessDate(new Date());
    rows = rows.filter((row) => {
      const hasActiveEmployment = row.employeeEmployments.some((employment) => employmentIsActiveOnDate(employment, today));
      return isActive ? hasActiveEmployment : !hasActiveEmployment;
    });
  }
  if (input.company) {
    const today = workspaceBusinessDate(new Date());
    rows = rows.filter((row) =>
      row.employeeEmployments
        .filter((employment) => isActive === null || employmentIsActiveOnDate(employment, today) === isActive)
        .some((employment) => primaryContractCompany(employment.contracts, employment.currentCompany) === input.company),
    );
  }
  if (input.department) {
    rows = rows.filter((row) => row.departmentName === input.department);
  }
  if (input.position) {
    rows = rows.filter((row) => row.positionName === input.position);
  }

  if (input.keyword) {
    rows = rows.filter((row) => {
      const employee = employeeMap.get(Number(row.employeeId));
      return matchSearchFields({
        ...row,
        employeeCode: employee?.employeeId,
      }, input.keyword, ["employeeName", "employeeCode", "employeeId", "departmentName", "positionName", "reportTo"]);
    });
  }

  const total = rows.length;
  const start = (input.page - 1) * input.pageSize;
  return {
    positions: rows.slice(start, start + input.pageSize).map(({ employeeEmployments: _employeeEmployments, ...row }) => row),
    total,
  };
}
