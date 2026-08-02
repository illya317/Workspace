import {
  buildContainsWhere,
} from "@workspace/platform/server/dal/pagination";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { resolveConfiguredBusinessRequiredByRelation } from "@workspace/platform/server/relation-policy-validation";
import type { Contract, ContractWorkView } from "@workspace/administration/types";
import { CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS } from "../contract-business-required";
import { buildContractRecordAccessWhere } from "./contract-access";
import { renderContractsCsv } from "./contract-csv";
import {
  commitCreateContractCommand,
  commitUpdateContractCommand,
} from "./contract-direct-writes";
import { commitDeleteContractCommand } from "./contract-draft-delete";
import {
  CONTRACT_INCLUDE,
  dateAtBusinessDay,
  toContractDto,
} from "./contract-record-projection";
import {
  buildContractCreateCommand,
  buildContractTargetCommand,
  buildContractUpdateCommand,
  type ContractTargetCommand,
} from "./domain/administration-contract-validation";
import type { ContractCreateInput, ContractUpdateInput } from "./schemas";
export { commitCreateContractCommand, commitUpdateContractCommand } from "./contract-direct-writes";
export { commitDeleteContractCommand } from "./contract-draft-delete";
export { ContractCreateSchema, ContractUpdateSchema } from "./schemas";
export { renderContractsCsv } from "./contract-csv";
export type { ContractCreateInput, ContractUpdateInput } from "./schemas";

export interface ContractListFilters {
  userId?: number;
  q?: string;
  location?: string;
  category?: string;
  categoryId?: number;
  ownerDepartmentId?: number;
  lifecycleStatus?: string;
  view?: ContractWorkView;
  page?: number;
  pageSize?: number;
}

export type ContractExportRecord = Contract;

export function resolveContractBusinessRequiredByRelation(
  policies: Readonly<Record<string, "required" | "optional">>,
) {
  return Object.fromEntries(
    CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS.map((relationKey) => {
      const policy = policies[relationKey];
      if (policy !== "required" && policy !== "optional") {
        throw new Error(`合同关系 ${relationKey} 未解析到业务必填策略`);
      }
      return [
        relationKey,
        policy === "required",
      ];
    }),
  );
}

type CreateContractInput = {
  userId: number;
  body: ContractCreateInput;
  idempotencyKey: string;
};

type UpdateContractInput = {
  id: number;
  userId: number;
  body: ContractUpdateInput;
  expectedVersion?: number;
  idempotencyKey: string;
};

type TargetContractInput = {
  id: number;
  userId: number;
  expectedVersion?: number;
};

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

function mapWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return serviceError("合同唯一标识冲突，请重试", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return serviceError("合同不存在", 404);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return serviceError("合同引用的主数据不存在或不可用", 409);
  }
  throw error;
}

function workViewWhere(view: ContractWorkView | undefined, duplicateNumbers: readonly string[]): Prisma.ContractWhereInput {
  const today = dateAtBusinessDay();
  const ninetyDays = new Date(today);
  ninetyDays.setUTCDate(ninetyDays.getUTCDate() + 90);
  if (view === "expiring") {
    return {
      expiresOn: { gte: today, lte: ninetyDays },
      lifecycleStatus: { notIn: ["closed", "terminated", "expired"] },
    };
  }
  if (view === "expired") {
    return {
      expiresOn: { lt: today },
      lifecycleStatus: { notIn: ["closed", "terminated"] },
    };
  }
  if (view !== "needs_attention") return {};
  return {
    OR: [
      { contractNo: null },
      ...(duplicateNumbers.length ? [{ contractNo: { in: [...duplicateNumbers] } }] : []),
      { category: { name: "待补全" } },
      { partyA: null },
      { partyB: null },
      { partyAId: null },
      { partyBId: null },
      { handlerEmployeeId: null },
      { lifecycleStatus: "unknown" },
      { signatureStatus: "unknown" },
      { performanceStatus: "unknown" },
      { signedOn: null, legacySignDateRaw: { not: null } },
      { expiresOn: null, legacyEndDateRaw: { not: null } },
      { amount: { lt: 0 } },
      { confidentialityLevel: { gte: 3 }, handlerEmployeeId: null, ownerDepartmentId: null },
    ],
  };
}

async function duplicateContractNumbers(accessWhere: Prisma.ContractWhereInput) {
  const groups = await prisma.contract.groupBy({
    by: ["contractNo"],
    where: { AND: [accessWhere, { isArchived: false, contractNo: { not: null } }] },
    _count: { _all: true },
  });
  return groups.flatMap((group) => group.contractNo && group._count._all > 1 ? [group.contractNo] : []);
}

async function buildWhere(filters: ContractListFilters) {
  const accessWhere = filters.userId
    ? await buildContractRecordAccessWhere(filters.userId)
    : { confidentialityLevel: { lte: 2 } } satisfies Prisma.ContractWhereInput;
  const duplicates = await duplicateContractNumbers(accessWhere);
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
    (keywordWhere.OR as Record<string, unknown>[]).push(
      { handlerEmployee: { name: { contains: keyword, mode: "insensitive" } } },
      { category: { name: { contains: keyword, mode: "insensitive" } } },
      { ownerDepartment: { name: { contains: keyword, mode: "insensitive" } } },
      { owningCompany: { party: { name: { contains: keyword, mode: "insensitive" } } } },
    );
  }
  return {
    where: {
      AND: [
        accessWhere,
        { isArchived: false },
        ...(filters.location ? [{ location: filters.location }] : []),
        ...(filters.category ? [{ category: { name: filters.category } }] : []),
        ...(filters.categoryId ? [{ categoryId: filters.categoryId }] : []),
        ...(filters.ownerDepartmentId ? [{ ownerDepartmentId: filters.ownerDepartmentId }] : []),
        ...(filters.lifecycleStatus ? [{ lifecycleStatus: filters.lifecycleStatus }] : []),
        ...(keywordWhere ? [keywordWhere] : []),
        workViewWhere(filters.view, duplicates),
      ],
    } satisfies Prisma.ContractWhereInput,
    accessWhere,
    duplicates,
  };
}

export async function listContracts(filters: ContractListFilters) {
  if (!filters.userId) throw new Error("listContracts requires userId");
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const built = await buildWhere(filters);
  const skip = (page - 1) * pageSize;
  const [contracts, total, allLocations, categories, requiredPolicies] = await Promise.all([
    prisma.contract.findMany({
      where: built.where,
      include: CONTRACT_INCLUDE,
      orderBy: filters.view === "expiring" || filters.view === "expired"
        ? [{ expiresOn: "asc" }, { id: "desc" }]
        : { id: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.contract.count({ where: built.where }),
    prisma.contract.findMany({
      select: { location: true },
      distinct: ["location"],
      where: { AND: [built.accessWhere, { isArchived: false, location: { not: null } }] },
    }),
    prisma.contractCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    resolveConfiguredBusinessRequiredByRelation(CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS),
  ]);
  const duplicateSet = new Set(built.duplicates);
  return {
    contracts: contracts.map((contract) => toContractDto(contract, duplicateSet)),
    total,
    page,
    pageSize,
    locations: allLocations.map((item) => item.location).filter((value): value is string => Boolean(value)),
    categories,
    businessRequiredByRelation: resolveContractBusinessRequiredByRelation(requiredPolicies),
  };
}

export async function loadContractExportRecords(filters: ContractListFilters = {}) {
  const built = await buildWhere(filters);
  const contracts = await prisma.contract.findMany({
    where: built.where,
    include: CONTRACT_INCLUDE,
    orderBy: { id: "desc" },
  });
  const duplicateSet = new Set(built.duplicates);
  return contracts.map((contract) => toContractDto(contract, duplicateSet));
}

export async function exportContracts(filters: ContractListFilters) {
  if (!filters.userId) return serviceError("缺少用户身份", 401);
  const csv = renderContractsCsv(await loadContractExportRecords(filters));
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contract-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

export async function commitArchiveContractCommand(command: ContractTargetCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  try {
    const result = await guardedDelete({
      entityType: "Contract",
      modelKey: "contract",
      id: command.id,
      userId: command.userId,
      expectedVersion: command.expectedVersion,
      actionLabel: "归档合同",
      deleteMode: "archive",
      referencePolicy: "retained",
      transactionIsolation: "serializable",
      scopeGuard: async (context) => {
        const visible = await context.tx.contract.findFirst({
          where: { AND: [{ id: command.id }, accessWhere] },
          select: { id: true, lifecycleStatus: true, currentRevisionId: true },
        });
        if (!visible) return { error: "合同不存在", status: 404 };
        return visible.lifecycleStatus !== "draft" && visible.currentRevisionId
          ? { ok: true }
          : { error: "合同草稿不能归档，请继续编辑或删除草稿", status: 409 };
      },
    });
    return result.ok ? serviceOk({ success: true }) : serviceError(result.error, result.status || 400);
  } catch (error) {
    return mapWriteError(error);
  }
}

const createContractAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.create",
  validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractCreateCommand",
  commitKey: "packages/administration/server/contracts.commitCreateContractCommand",
  validate: async (input: CreateContractInput) => {
    const command = await buildContractCreateCommand(input.body, input.userId, input.idempotencyKey);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitCreateContractCommand,
});

const updateContractAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.update",
  validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractUpdateCommand",
  commitKey: "packages/administration/server/contracts.commitUpdateContractCommand",
  validate: async (input: UpdateContractInput) => {
    const command = await buildContractUpdateCommand(
      input.id,
      input.body,
      input.userId,
      input.expectedVersion,
      input.idempotencyKey,
    );
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitUpdateContractCommand,
});

const archiveContractAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.archive",
  validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractTargetCommand",
  commitKey: "packages/administration/server/contracts.commitArchiveContractCommand",
  validate: (input: TargetContractInput) => {
    const command = buildContractTargetCommand(input.id, input.userId, input.expectedVersion);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitArchiveContractCommand,
});

const deleteContractAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.delete",
  validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractTargetCommand",
  commitKey: "packages/administration/server/contracts.commitDeleteContractCommand",
  validate: (input: TargetContractInput) => {
    const command = buildContractTargetCommand(input.id, input.userId, input.expectedVersion);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitDeleteContractCommand,
});

export function executeCreateContractCommand(input: CreateContractInput) {
  return executeDirectBusinessActionCommand({ command: createContractAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeUpdateContractCommand(input: UpdateContractInput) {
  return executeDirectBusinessActionCommand({ command: updateContractAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeArchiveContractCommand(input: TargetContractInput) {
  return executeDirectBusinessActionCommand({ command: archiveContractAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeDeleteContractCommand(input: TargetContractInput) {
  return executeDirectBusinessActionCommand({ command: deleteContractAdapter, input, context: undefined, actorUserId: input.userId });
}
