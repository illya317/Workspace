import {
  buildContainsWhere,
} from "@workspace/platform/server/dal/pagination";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import type { Contract, ContractWorkView } from "@workspace/administration/types";
import { buildContractRecordAccessWhere, canOwnContractScope } from "./contract-access";
import { renderContractsCsv } from "./contract-csv";
import { commitDeleteContractCommand } from "./contract-draft-delete";
import {
  createInitialContractDraftRevision,
  refreshInitialContractDraftRevision,
} from "./contract-revisions";
import {
  buildContractCreateCommand,
  buildContractTargetCommand,
  buildContractUpdateCommand,
  validateContractState,
  type ContractTargetCommand,
  type ContractWriteCommand,
} from "./domain/administration-contract-validation";
import { canHardDeleteContractFacts } from "./domain/contract-lifecycle-policy";
import type { ContractCreateInput, ContractUpdateInput } from "./schemas";
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

type CreateContractInput = {
  userId: number;
  body: ContractCreateInput;
};

type UpdateContractInput = {
  id: number;
  userId: number;
  body: ContractUpdateInput;
  expectedVersion?: number;
};

type TargetContractInput = {
  id: number;
  userId: number;
  expectedVersion?: number;
};

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

const CONTRACT_INCLUDE = {
  category: { select: { id: true, name: true } },
  owningCompany: { select: { id: true, party: { select: { name: true, fullName: true } } } },
  ownerDepartment: { select: { id: true, name: true } },
  partyAIdentity: { select: { id: true, name: true, fullName: true } },
  partyBIdentity: { select: { id: true, name: true, fullName: true } },
  handlerEmployee: {
    select: {
      name: true,
      employments: { select: { isActive: true, joinDate: true, leaveDate: true } },
    },
  },
  revisions: { select: { recordState: true } },
  _count: { select: { attachments: true, records: true, stateEvents: true } },
} satisfies Prisma.ContractInclude;

type ContractRecord = Prisma.ContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function identityName(value: { name: string; fullName: string | null } | null) {
  return value?.fullName || value?.name || null;
}

function dataQualityIssues(contract: ContractRecord, duplicateContractNumbers: ReadonlySet<string>) {
  const issues: string[] = [];
  if (!contract.contractNo) issues.push("缺少合同编号");
  else if (duplicateContractNumbers.has(contract.contractNo)) issues.push("合同编号重复");
  if (contract.category.name === "待补全") issues.push("缺少合同类型");
  if (!contract.partyA) issues.push("缺少甲方名称");
  if (!contract.partyB) issues.push("缺少乙方名称");
  if (!contract.partyAId) issues.push("甲方未关联主体主数据");
  if (!contract.partyBId) issues.push("乙方未关联主体主数据");
  if (!contract.handlerEmployeeId) issues.push("缺少经办人");
  if (contract.lifecycleStatus === "unknown") issues.push("合同状态待确认");
  if (contract.signatureStatus === "unknown") issues.push("签署状态待确认");
  if (contract.performanceStatus === "unknown") issues.push("履行状态待确认");
  if (contract.legacySignDateRaw && !contract.signedOn) issues.push("签订日期精度不足");
  if (contract.legacyEndDateRaw && !contract.expiresOn) issues.push("结束日期精度不足");
  if (contract.amount?.isNegative()) issues.push("合同金额为负数");
  if (contract.confidentialityLevel >= 3 && !contract.handlerEmployeeId && !contract.ownerDepartmentId) {
    issues.push("机密合同缺少责任归属");
  }
  return issues;
}

function toContractDto(contract: ContractRecord, duplicateContractNumbers: ReadonlySet<string> = new Set()): Contract {
  const {
    category,
    owningCompany,
    ownerDepartment,
    partyAIdentity,
    partyBIdentity,
    handlerEmployee,
    revisions,
    _count,
    amount,
    executedAmount,
    signedOn,
    expiresOn,
    approvedOn,
    approvalSyncedAt,
    ...record
  } = contract;
  return {
    ...record,
    amount: amount === null ? null : amount.toNumber(),
    executedAmount: executedAmount === null ? null : executedAmount.toNumber(),
    signedOn: isoDate(signedOn),
    expiresOn: isoDate(expiresOn),
    approvedOn: isoDate(approvedOn),
    approvalSyncedAt: approvalSyncedAt?.toISOString() ?? null,
    lifecycleStatus: record.lifecycleStatus as Contract["lifecycleStatus"],
    signatureStatus: record.signatureStatus as Contract["signatureStatus"],
    performanceStatus: record.performanceStatus as Contract["performanceStatus"],
    archivedAt: record.archivedAt?.toISOString() ?? null,
    editedAt: record.editedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    categoryName: category.name,
    owningCompanyName: identityName(owningCompany?.party ?? null),
    ownerDepartmentName: ownerDepartment?.name ?? null,
    partyAIdentityName: identityName(partyAIdentity),
    partyBIdentityName: identityName(partyBIdentity),
    handlerEmployeeName: handlerEmployee?.name ?? null,
    handlerEmployeeActive:
      handlerEmployee?.employments.some((employment) => employmentIsActiveOnDate(employment, workspaceBusinessDate(new Date()))) ?? null,
    dataQualityIssues: dataQualityIssues(contract, duplicateContractNumbers),
    canHardDelete: canHardDeleteContractFacts({
      lifecycleStatus: contract.lifecycleStatus,
      isArchived: contract.isArchived,
      currentRevisionId: contract.currentRevisionId,
      approvalSourceKey: contract.approvalSourceKey,
      attachmentCount: _count.attachments,
      recordCount: _count.records,
      stateEventCount: _count.stateEvents,
      revisionStates: revisions.map((revision) => revision.recordState),
    }),
  };
}

function dateAtBusinessDay(value: Date = new Date()) {
  return new Date(`${workspaceBusinessDate(value)}T00:00:00.000Z`);
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
  const [contracts, total, allLocations, categories] = await Promise.all([
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
  ]);
  const duplicateSet = new Set(built.duplicates);
  return {
    contracts: contracts.map((contract) => toContractDto(contract, duplicateSet)),
    total,
    page,
    pageSize,
    locations: allLocations.map((item) => item.location).filter((value): value is string => Boolean(value)),
    categories,
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

async function contractNumberConflict(contractNo: unknown, excludeId?: number, tx: Prisma.TransactionClient = prisma) {
  if (typeof contractNo !== "string" || !contractNo.trim()) return false;
  return Boolean(await tx.contract.findFirst({
    where: { contractNo: contractNo.trim(), ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  }));
}

async function lockContractNumber(contractNo: unknown, tx: Prisma.TransactionClient) {
  if (typeof contractNo !== "string" || !contractNo.trim()) return;
  await tx.$queryRaw<Array<{ locked: string }>>(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${contractNo.trim()}))::text AS locked
  `);
}

function scopeState(data: Prisma.ContractUncheckedCreateInput | Prisma.ContractUncheckedUpdateInput, current?: ContractRecord) {
  return {
    confidentialityLevel: Number(data.confidentialityLevel ?? current?.confidentialityLevel ?? 2),
    handlerEmployeeId: (data.handlerEmployeeId === undefined ? current?.handlerEmployeeId : data.handlerEmployeeId) as number | null,
    ownerDepartmentId: (data.ownerDepartmentId === undefined ? current?.ownerDepartmentId : data.ownerDepartmentId) as number | null,
  };
}

async function lockContract(id: number, tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT "id" FROM "Contract" WHERE "id" = ${id} FOR UPDATE
  `);
  return rows.length > 0;
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

export async function commitCreateContractCommand(command: ContractWriteCommand) {
  if (!await canOwnContractScope({ userId: command.userId, ...scopeState(command.data) })) {
    return serviceError("机密合同必须归属于当前经办人或其负责部门；绝密合同仅系统管理员可维护", 403);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await lockContractNumber(command.data.contractNo, tx);
      if (await contractNumberConflict(command.data.contractNo, undefined, tx)) {
        return serviceError("合同编号已存在", 409);
      }
      const record = await tx.contract.create({
        data: {
          ...command.data as Prisma.ContractUncheckedCreateInput,
          lifecycleStatus: "draft",
          signatureStatus: "unknown",
          performanceStatus: "not_started",
          editedBy: command.userId,
          editedAt: new Date(),
        },
        include: CONTRACT_INCLUDE,
      });
      await createInitialContractDraftRevision(tx, record as unknown as Record<string, unknown> & { id: number; createdAt: Date; signedOn?: Date | null }, command.userId);
      const created = await tx.contract.findUniqueOrThrow({ where: { id: record.id }, include: CONTRACT_INCLUDE });
      return serviceOk({ success: true, record: toContractDto(created) });
    });
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function commitUpdateContractCommand(command: ContractTargetCommand & ContractWriteCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  const current = await prisma.contract.findFirst({
    where: { AND: [{ id: command.id, isArchived: false }, accessWhere] },
    include: CONTRACT_INCLUDE,
  });
  if (!current) return serviceError("合同不存在", 404);
  if (current.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
  if (current.lifecycleStatus !== "draft" || current.currentRevisionId !== null) {
    return serviceError("正式合同不能直接覆盖，请创建合同修订草稿", 409);
  }
  const nextState = {
    signedOn: (command.data.signedOn === undefined ? current.signedOn : command.data.signedOn) as Date | null,
    expiresOn: (command.data.expiresOn === undefined ? current.expiresOn : command.data.expiresOn) as Date | null,
  };
  const stateValidation = validateContractState(nextState);
  if (!stateValidation.ok) return validationError(stateValidation.issue);
  if (!await canOwnContractScope({ userId: command.userId, ...scopeState(command.data, current) })) {
    return serviceError("机密合同必须归属于当前经办人或其负责部门；绝密合同仅系统管理员可维护", 403);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockContract(command.id, tx)) return serviceError("合同不存在", 404);
      const locked = await tx.contract.findFirst({
        where: { AND: [{ id: command.id, isArchived: false }, accessWhere] },
      });
      if (!locked) return serviceError("合同不存在", 404);
      if (locked.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
      if (locked.lifecycleStatus !== "draft" || locked.currentRevisionId !== null) {
        return serviceError("正式合同不能直接覆盖，请创建合同修订草稿", 409);
      }
      await lockContractNumber(command.data.contractNo, tx);
      if (await contractNumberConflict(command.data.contractNo, command.id, tx)) return serviceError("合同编号已存在", 409);
      await ensureEditHistoryBaseline("Contract", command.id, command.userId, tx);
      await tx.contract.update({
        where: { id: command.id },
        data: {
          ...command.data,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const draftContract = await tx.contract.findUniqueOrThrow({ where: { id: command.id } });
      if (!await refreshInitialContractDraftRevision(tx, draftContract as unknown as Record<string, unknown> & { id: number; createdAt: Date; signedOn?: Date | null })) {
        return serviceError("合同初始修订草稿不存在", 409);
      }
      await snapshotHistory("Contract", command.id, command.userId, tx);
      const updated = await tx.contract.findUniqueOrThrow({ where: { id: command.id }, include: CONTRACT_INCLUDE });
      return serviceOk({ success: true, record: toContractDto(updated) });
    });
  } catch (error) {
    return mapWriteError(error);
  }
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
    const command = await buildContractUpdateCommand(input.id, input.body, input.userId, input.expectedVersion);
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
