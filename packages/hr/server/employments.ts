import { checkHRUpdate } from "@workspace/platform/server/auth";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma } from "@workspace/platform/server/prisma";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { matchEmployee } from "@workspace/platform/search";
import { parseContracts } from "./contracts";
import {
  buildEmploymentCreateCommand,
  buildEmploymentPageDraftCommand,
} from "./domain/employment-validation";
import { employeePositionFilterInclude, employeePositionMatches } from "./employee-position-filters";
import { serviceError, serviceOk } from "@workspace/platform/server/api";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function openEndedAtDateWhere(employeeId: number, date: string) {
  return {
    employeeId,
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: date } }],
  };
}

export function primaryContractCompany(contractsJson: string | null, fallback: string | null) {
  const contracts = parseContracts(contractsJson);
  const primaryCompany = String(contracts.find((contract) => contract.isPrimary === true && contract.company)?.company ?? "");
  const firstCompany = String(contracts.find((contract) => contract.company)?.company ?? "");
  return primaryCompany || firstCompany || fallback || null;
}

export async function listEmployments(input: {
  keyword: string;
  isActive: string | null;
  company: string;
  department: string;
  position: string;
  personnelType: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.EmploymentWhereInput = {};
  if (input.isActive !== null && input.isActive !== "") {
    where.isActive = input.isActive === "true" ? true : input.isActive === "false" ? false : undefined;
  }

  const defaultPage = !input.keyword
    && !input.company
    && !input.department
    && !input.position
    && !input.personnelType;
  if (defaultPage) {
    const [total, items] = await Promise.all([
      prisma.employment.count({ where }),
      prisma.employment.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
        },
        orderBy: { id: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName: item.employee?.name || "",
        isActive: item.isActive,
        currentCompany: primaryContractCompany(item.contracts, item.currentCompany),
        joinDate: item.joinDate,
        leaveDate: item.leaveDate,
        leaveReason: item.leaveReason,
        leaveNote: item.leaveNote,
        officeLocation: item.officeLocation,
        personnelType: item.personnelType,
        rank: item.rank,
        title: item.title,
        contracts: item.contracts,
      })),
      total,
    };
  }

  const items = await prisma.employment.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          employeeId: true,
          name: true,
          positions: { include: employeePositionFilterInclude },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const mapped = items.map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employee?.name || "",
    employeePositions: item.employee?.positions ?? [],
    isActive: item.isActive,
    currentCompany: primaryContractCompany(item.contracts, item.currentCompany),
    joinDate: item.joinDate,
    leaveDate: item.leaveDate,
    leaveReason: item.leaveReason,
    leaveNote: item.leaveNote,
    officeLocation: item.officeLocation,
    personnelType: item.personnelType,
    rank: item.rank,
    title: item.title,
    contracts: item.contracts,
  }));

  let filtered = mapped;
  if (input.keyword) {
    filtered = mapped.filter((employment) => matchEmployee({ name: employment.employeeName, employeeId: String(employment.employeeId) }, input.keyword));
  }
  if (input.company) {
    filtered = filtered.filter((employment) => employment.currentCompany === input.company);
  }
  if (input.department || input.position) {
    filtered = filtered.filter((employment) =>
      employeePositionMatches(employment.employeePositions, { department: input.department, position: input.position }),
    );
  }
  if (input.personnelType) {
    filtered = filtered.filter((employment) => employment.personnelType === input.personnelType);
  }

  const total = filtered.length;
  const start = (input.page - 1) * input.pageSize;
  return {
    items: filtered.slice(start, start + input.pageSize).map(({ employeePositions: _employeePositions, ...item }) => item),
    total,
  };
}

export async function createEmploymentRecord(
  input: Record<string, unknown>,
  userId: number,
): Promise<ServiceResult<{ success: true; record: { id: number } }>> {
  const command = mapValidationToServiceResult(await buildEmploymentCreateCommand(input));
  if (!command.ok) return command;

  const record = await prisma.employment.create({
    data: { ...command.data, editedBy: userId } as Prisma.EmploymentUncheckedCreateInput,
    select: { id: true },
  });
  await snapshotHistory("Employment", record.id, userId);
  return serviceOk({ success: true, record });
}

export async function updateEmploymentPageDraft(input: {
  userId: number;
  changes: Array<{ id: number; field: string; value: unknown }>;
}) {
  const command = mapValidationToServiceResult(await buildEmploymentPageDraftCommand(input));
  if (!command.ok) return command;
  if (!(await checkHRUpdate(command.data.userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employment.update",
    actorUserId: command.data.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "雇佣关系更新已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const ids = Array.from(new Set(command.data.changes.map((change) => change.id)));
  const rows = await prisma.employment.findMany({
    where: { id: { in: ids } },
    select: { id: true, employeeId: true, leaveDate: true },
  });
  if (rows.length !== ids.length) return serviceError("部分雇佣记录不存在，请刷新后重试", 404);
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const changesById = new Map<number, Record<string, unknown>>();
  for (const change of command.data.changes) {
    changesById.set(change.id, { ...(changesById.get(change.id) ?? {}), [change.field]: change.value ?? null });
  }

  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      const row = rowMap.get(id)!;
      const data = changesById.get(id) ?? {};
      await ensureEditHistoryBaseline("Employment", id, command.data.userId, tx);
      await tx.employment.update({
        where: { id },
        data: { ...data, editedBy: command.data.userId, editedAt: new Date(), version: { increment: 1 } },
      });

      if (data.isActive === false) {
        const endDate = typeof data.leaveDate === "string" && data.leaveDate
          ? data.leaveDate
          : row.leaveDate || new Date().toISOString().slice(0, 10);
        const [edps, projectMembers] = await Promise.all([
          tx.eDP.findMany({ where: openEndedAtDateWhere(row.employeeId, endDate), select: { id: true } }),
          tx.employeeProject.findMany({ where: openEndedAtDateWhere(row.employeeId, endDate), select: { id: true } }),
        ]);
        for (const item of edps) await ensureEditHistoryBaseline("EDP", item.id, command.data.userId, tx);
        for (const item of projectMembers) await ensureEditHistoryBaseline("EmployeeProject", item.id, command.data.userId, tx);
        if (edps.length > 0) await tx.eDP.updateMany({
          where: { id: { in: edps.map((item) => item.id) } },
          data: { endDate, editedBy: command.data.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        if (projectMembers.length > 0) await tx.employeeProject.updateMany({
          where: { id: { in: projectMembers.map((item) => item.id) } },
          data: { endDate, editedBy: command.data.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        for (const item of edps) await snapshotHistory("EDP", item.id, command.data.userId, tx);
        for (const item of projectMembers) await snapshotHistory("EmployeeProject", item.id, command.data.userId, tx);
      }
      await snapshotHistory("Employment", id, command.data.userId, tx);
    }
  });
  return serviceOk({ success: true, updatedCount: ids.length, changeCount: command.data.changes.length });
}

export function rejectEmploymentDelete() {
  return serviceError("雇佣记录不允许删除", 405);
}
