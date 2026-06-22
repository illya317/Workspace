import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@workspace/platform/server/auth";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { matchSearchFields } from "@workspace/platform/search";
import { formatDepartmentPath } from "@workspace/hr/utils/department-path";
import { prisma } from "@workspace/platform/server/prisma";
import { handleDelete } from "./hr-crud";
import {
  buildEdpCreateCommand,
  buildEdpFieldUpdateCommand,
  EDP_ALLOWED_FIELDS,
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
};

function activeFilterValue(value: string | null | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function listEdps(input: { keyword: string; isActive?: string | null; company?: string; page: number; pageSize: number }) {
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
      departmentId: edp.departmentId,
      departmentName: formatDepartmentPath(edp.department) || edp.department?.name || "",
      positionId: edp.positionId,
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
  if (!currentTotal.ok) return { ok: false, error: currentTotal.error, status: currentTotal.status };

  const record = await prisma.eDP.create({
    data: {
      employeeId: command.data.employeeId,
      departmentId: command.data.departmentId,
      positionId: command.data.positionId,
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
  return { ok: true, data: { success: true, record } };
}

export async function updateEdpField(request: Request, params: Promise<{ id: string }>) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return NextResponse.json({ error: "记录ID无效" }, { status: 400 });

  const body = await request.json();
  const { field, value } = body as { field: string; value: unknown };
  const command = mapValidationToServiceResult(await buildEdpFieldUpdateCommand(field, value, recordId));
  if (!command.ok) return NextResponse.json({ error: command.error }, { status: command.status || 400 });
  if (!EDP_ALLOWED_FIELDS.includes(command.data.field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });
  if (edpUpdateAffectsCurrentTotal(command.data.data)) {
    const currentTotal = mapValidationToServiceResult(
      await validateEdpFieldUpdateCurrentTotal(recordId, command.data.data),
    );
    if (!currentTotal.ok) return NextResponse.json({ error: currentTotal.error }, { status: currentTotal.status || 400 });
  }

  const data: Record<string, unknown> = {
    ...command.data.data,
    editedBy: payload.userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };

  await prisma.eDP.update({ where: { id: recordId }, data });
  await snapshotHistory("EDP", recordId, payload.userId);
  return NextResponse.json({ success: true });
}

export async function deleteEdp(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, EDP_CONFIG);
}
