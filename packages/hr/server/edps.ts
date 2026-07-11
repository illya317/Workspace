import { checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { matchSearchFields } from "@workspace/platform/search";
import { prisma } from "@workspace/platform/server/prisma";
import { executeDelete, type CrudDeleteCommand, type CrudUpdateFieldCommand } from "./hr-crud";
import {
  buildEdpCreateCommand,
  buildEdpFieldUpdateCommand,
  EDP_ALLOWED_FIELDS,
  validateEdpDeleteCommand,
  type EdpCreateInput,
} from "./domain/edp-validation";
import {
  edpUpdateAffectsCurrentTotal,
  validateEdpCreateCurrentTotal,
  validateEdpFieldUpdateCurrentTotal,
} from "./domain/edp-total-validation";
import { primaryContractCompany } from "./employments";

const EDP_CONFIG = {
  entityType: "EDP",
  modelKey: "eDP" as const,
  allowedFields: EDP_ALLOWED_FIELDS,
  deleteMode: "hard" as const,
  deleteReferencePolicy: "none" as const,
  onBeforeDelete: normalizeEdpDelete,
};

async function normalizeEdpDelete(id: number) {
  const command = await validateEdpDeleteCommand(id);
  return command.ok ? { ok: true as const } : { error: command.issue.message, status: command.issue.status };
}

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
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeId: true,
      name: true,
      employments: {
        select: { isActive: true, currentCompany: true, contracts: true },
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
      reportingCompany: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ id: "asc" }],
  });

  const isActive = activeFilterValue(input.isActive);
  let rows = edps.map((edp) => {
    const employee = employeeMap.get(edp.employeeId);
    return {
      id: edp.id,
      employeeId: edp.employeeId,
      employeeName: employee?.name || "",
      employeeEmployments: employee?.employments ?? [],
      reportingCompanyId: edp.reportingCompanyId,
      reportingCompanyName: edp.reportingCompany?.name || "",
      departmentId: edp.departmentId,
      departmentName: edp.department?.name || "",
      positionId: edp.positionId,
      positionReportOverrideId: edp.positionReportOverrideId,
      positionName: edp.position?.name || "",
      isPrimary: edp.isPrimary,
      startDate: edp.startDate,
      endDate: edp.endDate,
      reportTo: edp.reportTo,
      workPercent: edp.workPercent,
    };
  });

  if (isActive !== null) {
    rows = rows.filter((row) => {
      const hasActiveEmployment = row.employeeEmployments.some((employment) => employment.isActive);
      return isActive ? hasActiveEmployment : !hasActiveEmployment;
    });
  }
  if (input.company) {
    rows = rows.filter((row) =>
      row.employeeEmployments
        .filter((employment) => isActive === null || employment.isActive === isActive)
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

export async function createEdp(
  input: EdpCreateInput,
  userId: number,
): Promise<DomainServiceResult<{ success: true; record: { id: number } }>> {
  const command = mapValidationToServiceResult(await buildEdpCreateCommand(input));
  if (!command.ok) return command;
  const currentTotal = mapValidationToServiceResult(await validateEdpCreateCurrentTotal(command.data));
  if (!currentTotal.ok) return currentTotal;

  const record = await prisma.eDP.create({
    data: {
      employeeId: command.data.employeeId,
      reportingCompanyId: command.data.reportingCompanyId,
      departmentId: command.data.departmentId,
      positionId: command.data.positionId,
      positionReportOverrideId: command.data.positionReportOverrideId,
      isPrimary: command.data.isPrimary,
      startDate: command.data.startDate,
      endDate: command.data.endDate,
      reportTo: command.data.reportTo,
      workPercent: command.data.workPercent,
      editedBy: userId,
    },
    select: { id: true },
  });
  await snapshotHistory("EDP", record.id, userId);
  return serviceOk({ success: true, record });
}

export async function updateEdpField(input: CrudUpdateFieldCommand) {
  if (!(await checkHRUpdate(input.userId, "hr.roster"))) return serviceError("无权限", 403);
  const recordId = input.id;
  if (!Number.isInteger(recordId) || recordId <= 0) return serviceError("记录ID无效", 400);

  const command = mapValidationToServiceResult(await buildEdpFieldUpdateCommand(input.field, input.value, recordId));
  if (!command.ok) return command;
  if (!EDP_ALLOWED_FIELDS.includes(command.data.field)) return serviceError("非法字段", 400);
  if (edpUpdateAffectsCurrentTotal(command.data.data)) {
    const currentTotal = mapValidationToServiceResult(
      await validateEdpFieldUpdateCurrentTotal(recordId, command.data.data),
    );
    if (!currentTotal.ok) return currentTotal;
  }

  const data: Record<string, unknown> = {
    ...command.data.data,
    editedBy: input.userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };

  await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("EDP", recordId, input.userId, tx);
    await tx.eDP.update({ where: { id: recordId }, data });
    await snapshotHistory("EDP", recordId, input.userId, tx);
  });
  return serviceOk({ success: true });
}

export async function deleteEdp(command: CrudDeleteCommand) {
  return executeDelete(command, EDP_CONFIG);
}
