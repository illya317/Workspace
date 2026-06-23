import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@workspace/platform/server/auth";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { Prisma } from "@workspace/platform/server/prisma";
import { handleCreate, handleUpdateField } from "./hr-crud";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { matchEmployee } from "@workspace/platform/search";
import { parseContracts } from "./contracts";
import {
  buildEmploymentCreateCommand,
  buildEmploymentFieldUpdateCommand,
  EMPLOYMENT_ALLOWED_FIELDS,
} from "./domain/employment-validation";
import { employeePositionFilterInclude, employeePositionMatches } from "./employee-position-filters";

const EMPLOYMENT_CONFIG = { entityType: "Employment", modelKey: "employment" as const };
type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function isFalseValue(value: unknown) {
  return value === false || value === "false";
}

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

async function normalizeEmploymentFieldUpdate(field: string, value: unknown, id?: number) {
  const command = await buildEmploymentFieldUpdateCommand(field, value, id);
  return command.ok ? command.data : { error: command.issue.message, status: command.issue.status };
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

export async function createEmployment(request: Request) {
  return handleCreate(request, EMPLOYMENT_CONFIG, async (body) => {
    const command = await buildEmploymentCreateCommand(body);
    return command.ok ? command.data : { error: command.issue.message, status: command.issue.status };
  });
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
  return { ok: true, data: { success: true, record } };
}

export async function updateEmploymentField(request: Request, params: Promise<{ id: string }>) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return NextResponse.json({ error: "记录ID无效" }, { status: 400 });

  const body = (await request.json()) as { field: string; value: unknown };
  if (body.field !== "isActive" || !isFalseValue(body.value)) {
    return handleUpdateField(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(body),
      }),
      Promise.resolve({ id }),
      {
        ...EMPLOYMENT_CONFIG,
        allowedFields: EMPLOYMENT_ALLOWED_FIELDS,
        onBeforeUpdate: normalizeEmploymentFieldUpdate,
      },
    );
  }

  const command = await buildEmploymentFieldUpdateCommand(body.field, body.value, recordId);
  if (!command.ok) return NextResponse.json({ error: command.issue.message }, { status: command.issue.status || 400 });

  const employment = await prisma.employment.findUnique({
    where: { id: recordId },
    select: { employeeId: true, leaveDate: true },
  });
  if (!employment) return NextResponse.json({ error: "雇佣记录不存在" }, { status: 404 });

  const endDate = employment.leaveDate || new Date().toISOString().slice(0, 10);

  await prisma.$transaction(async (tx) => {
    await tx.employment.update({
      where: { id: recordId },
      data: { isActive: false, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
    });

    const [edps, projectMembers] = await Promise.all([
      tx.eDP.findMany({
        where: openEndedAtDateWhere(employment.employeeId, endDate),
        select: { id: true },
      }),
      tx.employeeProject.findMany({
        where: openEndedAtDateWhere(employment.employeeId, endDate),
        select: { id: true },
      }),
    ]);

    if (edps.length > 0) {
      await tx.eDP.updateMany({
        where: { id: { in: edps.map((row) => row.id) } },
        data: { endDate, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      });
    }
    if (projectMembers.length > 0) {
      await tx.employeeProject.updateMany({
        where: { id: { in: projectMembers.map((row) => row.id) } },
        data: { endDate, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      });
    }

    for (const row of edps) await snapshotHistory("EDP", row.id, payload.userId, tx);
    for (const row of projectMembers) await snapshotHistory("EmployeeProject", row.id, payload.userId, tx);
    await snapshotHistory("Employment", recordId, payload.userId, tx);
  });

  return NextResponse.json({ success: true });
}

export function rejectEmploymentDelete() {
  return NextResponse.json({ error: "雇佣记录不允许删除" }, { status: 405 });
}
