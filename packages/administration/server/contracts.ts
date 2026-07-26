import {
  buildContainsWhere,
  buildFilterWhere,
} from "@workspace/platform/server/dal/pagination";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import {
  buildContractCreateCommand,
  buildContractDeleteCommand,
  buildContractUpdateCommand,
  type ContractDeleteCommand,
  type ContractWriteCommand,
} from "./domain/administration-contract-validation";
import type { ContractCreateInput, ContractUpdateInput } from "./schemas";
export { ContractCreateSchema, ContractUpdateSchema } from "./schemas";
export type { ContractCreateInput, ContractUpdateInput } from "./schemas";

export interface ContractListFilters {
  q?: string;
  location?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export type ContractExportRecord = {
  id: number;
  version: number;
  contractNo: string | null;
  name: string;
  partyA: string | null;
  partyB: string | null;
  shareholder: string | null;
  category: string | null;
  content: string | null;
  handlerEmployeeId: number | null;
  handlerEmployeeName: string | null;
  handlerEmployeeActive: boolean | null;
  signDate: string | null;
  endDate: string | null;
  status: string | null;
  amount: number | null;
  executedAmount: number | null;
  location: string | null;
  remark: string | null;
};

type CreateContractInput = {
  userId: number;
  body: ContractCreateInput;
};

type UpdateContractInput = {
  id: number;
  userId: number;
  body: ContractUpdateInput;
};

type DeleteContractInput = {
  id: number;
  userId: number;
  expectedVersion?: number;
};

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

const CONTRACT_HANDLER_INCLUDE = {
  handlerEmployee: {
    select: {
      name: true,
      employments: { select: { isActive: true, joinDate: true, leaveDate: true } },
    },
  },
} satisfies Prisma.ContractInclude;

type ContractWithHandler = Prisma.ContractGetPayload<{
  include: typeof CONTRACT_HANDLER_INCLUDE;
}>;

function toContractDto(contract: ContractWithHandler) {
  const { handlerEmployee, ...record } = contract;
  return {
    ...record,
    handlerEmployeeName: handlerEmployee?.name ?? null,
    handlerEmployeeActive:
      handlerEmployee?.employments.some((employment) => employmentIsActiveOnDate(employment, workspaceBusinessDate(new Date()))) ?? null,
  };
}

function buildWhere(filters: ContractListFilters): Prisma.ContractWhereInput {
  const where = buildFilterWhere<Prisma.ContractWhereInput>(filters as Record<string, unknown>, [
    "location",
    "category",
    "status",
  ]);
  const keywordWhere = buildContainsWhere(filters.q, [
    "name",
    "partyA",
    "partyB",
    "content",
    "contractNo",
    "shareholder",
    "remark",
  ]);
  const keyword = filters.q?.trim();
  if (keywordWhere && keyword) {
    (keywordWhere.OR as Record<string, unknown>[]).push({
      handlerEmployee: { name: { contains: keyword, mode: "insensitive" } },
    });
  }
  Object.assign(where, keywordWhere);
  return where;
}

export async function listContracts(filters: ContractListFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const where = buildWhere(filters);
  const skip = (page - 1) * pageSize;

  const [contracts, total, allLocations, allCategories, allStatuses] =
    await Promise.all([
      prisma.contract.findMany({
        where,
        include: CONTRACT_HANDLER_INCLUDE,
        orderBy: { id: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.contract.count({ where }),
      prisma.contract.findMany({
        select: { location: true },
        distinct: ["location"],
        where: { location: { not: null } },
      }),
      prisma.contract.findMany({
        select: { category: true },
        distinct: ["category"],
        where: { category: { not: null } },
      }),
      prisma.contract.findMany({
        select: { status: true },
        distinct: ["status"],
        where: { status: { not: null } },
      }),
    ]);

  return {
    contracts: contracts.map(toContractDto),
    total,
    page,
    pageSize,
    locations: allLocations.map((c) => c.location).filter((v): v is string => Boolean(v)),
    categories: allCategories.map((c) => c.category).filter((v): v is string => Boolean(v)),
    statuses: allStatuses.map((c) => c.status).filter((v): v is string => Boolean(v)),
  };
}

export function renderContractsCsv(contracts: readonly ContractExportRecord[]) {
  const header = [
    "ID", "版本", "合同编号", "合同名称", "甲方", "乙方", "股东", "合同类型",
    "合同内容", "经办人", "签订日期", "结束日期", "状态", "合同金额", "已执行金额",
    "位置", "备注",
  ];
  const rows = contracts.map((contract) => [
    contract.id,
    contract.version,
    contract.contractNo,
    contract.name,
    contract.partyA,
    contract.partyB,
    contract.shareholder,
    contract.category,
    contract.content,
    contract.handlerEmployeeName,
    contract.signDate,
    contract.endDate,
    contract.status,
    contract.amount,
    contract.executedAmount,
    contract.location,
    contract.remark,
  ]);
  return [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

export async function loadContractExportRecords(filters: ContractListFilters = {}) {
  const contracts = await prisma.contract.findMany({
    where: buildWhere(filters),
    include: CONTRACT_HANDLER_INCLUDE,
    orderBy: { id: "desc" },
  });
  return contracts.map(toContractDto);
}

export async function exportContracts(filters: ContractListFilters) {
  const csv = renderContractsCsv(await loadContractExportRecords(filters));
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contract-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function commitCreateContractCommand(
  command: ContractWriteCommand,
) {
  const record = await prisma.contract.create({
    data: {
      ...command.data as Prisma.ContractUncheckedCreateInput,
      editedBy: command.userId,
      editedAt: new Date(),
    },
    include: CONTRACT_HANDLER_INCLUDE,
  });
  return serviceOk({ success: true, record: toContractDto(record) });
}

export async function commitUpdateContractCommand(
  command: ContractDeleteCommand & ContractWriteCommand,
) {
  await prisma.contract.update({
    where: { id: command.id },
    data: {
      ...command.data,
      editedBy: command.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  return serviceOk({ success: true });
}

export async function commitDeleteContractCommand(
  command: ContractDeleteCommand,
) {
  const result = await guardedDelete({
    entityType: "Contract",
    modelKey: "contract",
    id: command.id,
    userId: command.userId,
    expectedVersion: command.expectedVersion,
    deleteMode: "hard",
    referencePolicy: "none",
  });
  return result.ok
    ? serviceOk({ success: true })
    : serviceError(result.error, result.status || 400);
}

const createContractAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.create",
  validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractCreateCommand",
  commitKey: "packages/administration/server/contracts.commitCreateContractCommand",
  validate: async (input: CreateContractInput) => {
    const command = await buildContractCreateCommand(input.body, input.userId);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitCreateContractCommand,
});

const updateContractAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.update",
  validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractUpdateCommand",
  commitKey: "packages/administration/server/contracts.commitUpdateContractCommand",
  validate: async (input: UpdateContractInput) => {
    const command = await buildContractUpdateCommand(input.id, input.body, input.userId);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitUpdateContractCommand,
});

const deleteContractAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.delete",
  validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractDeleteCommand",
  commitKey: "packages/administration/server/contracts.commitDeleteContractCommand",
  validate: (input: DeleteContractInput) => {
    const command = buildContractDeleteCommand(input.id, input.userId, input.expectedVersion);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitDeleteContractCommand,
});

export function executeCreateContractCommand(input: CreateContractInput) {
  return executeDirectBusinessActionCommand({
    command: createContractAdapter,
    input,
    context: undefined,
    actorUserId: input.userId,
  });
}

export function executeUpdateContractCommand(input: UpdateContractInput) {
  return executeDirectBusinessActionCommand({
    command: updateContractAdapter,
    input,
    context: undefined,
    actorUserId: input.userId,
  });
}

export function executeDeleteContractCommand(input: DeleteContractInput) {
  return executeDirectBusinessActionCommand({
    command: deleteContractAdapter,
    input,
    context: undefined,
    actorUserId: input.userId,
  });
}
