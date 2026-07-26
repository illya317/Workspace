import { checkHRUpdate } from "@workspace/platform/server/auth";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import type { DeleteGuardContext } from "@workspace/platform/server/delete-guard";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { matchSearchFields } from "@workspace/platform/search";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { currentEmploymentDateWhere, employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import { executeDelete, type CrudDeleteCommand } from "./hr-crud";
import {
  buildEdpCreateCommand,
  buildEdpPageDraftCommand,
  EDP_ALLOWED_FIELDS,
  validateEdpDeleteCommand,
  type EdpCreateInput,
} from "./domain/edp-validation";
import { validateEdpCreateCurrentTotal } from "./domain/edp-total-validation";
import { primaryContractCompany } from "./employments";
import { queueHrDataQualityEvaluation } from "./data-quality-trigger";

const EDP_CONFIG = {
  entityType: "EDP",
  modelKey: "eDP" as const,
  allowedFields: EDP_ALLOWED_FIELDS,
  deleteMode: "hard" as const,
  deleteReferencePolicy: "none" as const,
  onBeforeDelete: normalizeEdpDelete,
};

async function normalizeEdpDelete(id: number, context: DeleteGuardContext) {
  const command = await validateEdpDeleteCommand(id);
  if (!command.ok) return { error: command.issue.message, status: command.issue.status };
  const row = await context.tx.eDP.findUnique({
    where: { id: command.data.id },
    select: {
      employee: {
        select: {
          user: { select: { agentProfile: { select: { key: true } } } },
        },
      },
    },
  });
  if (row?.employee?.user?.agentProfile) {
    return {
      error: `Agent 虚拟员工 ${row.employee.user.agentProfile.key} 的岗位记录不能直接删除，请通过结束日期维护生命周期`,
      status: 409,
    };
  }
  return { ok: true as const };
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
        workPercent: edp.workPercent,
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
      workPercent: edp.workPercent,
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
      reportToPositionId: command.data.reportToPositionId,
      workPercent: command.data.workPercent,
      editedBy: userId,
    },
    select: { id: true },
  });
  await snapshotHistory("EDP", record.id, userId);
  await queueHrDataQualityEvaluation("EDP", [record.id]);
  return serviceOk({ success: true, record });
}

export async function updateEdpPageDraft(input: {
  userId: number;
  changes: Array<{ id: number; field: string; value: unknown }>;
}) {
  const command = mapValidationToServiceResult(await buildEdpPageDraftCommand(input));
  if (!command.ok) return command;
  if (!(await checkHRUpdate(command.data.userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.edp.update",
    actorUserId: command.data.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "部门岗位更新已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const changesById = new Map<number, Record<string, unknown>>();
  for (const change of command.data.changes) {
    changesById.set(change.id, { ...(changesById.get(change.id) ?? {}), ...change.data });
  }
  const ids = Array.from(changesById.keys());
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await ensureEditHistoryBaseline("EDP", id, command.data.userId, tx);
      await tx.eDP.update({
        where: { id },
        data: {
          ...changesById.get(id),
          editedBy: command.data.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await snapshotHistory("EDP", id, command.data.userId, tx);
    }
  });
  await queueHrDataQualityEvaluation("EDP", ids);
  return serviceOk({ success: true, updatedCount: ids.length, changeCount: command.data.changes.length });
}

export async function deleteEdp(command: CrudDeleteCommand) {
  const result = await executeDelete(command, EDP_CONFIG);
  if (result.ok) await queueHrDataQualityEvaluation("EDP", [command.id]);
  return result;
}
