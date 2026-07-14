import { matchSearchFields } from "@workspace/platform/search";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { ExternalPartyCategory } from "@workspace/external/types";
import {
  buildExternalPartyCreateCommand,
  buildExternalPartyDeleteCommand,
  buildExternalPartyUpdateCommand,
  type ExternalPartyCreateCommand,
  type ExternalPartyDeleteCommand,
  type ExternalPartyUpdateCommand,
} from "./domain/external-party-validation";
import type { ExternalPartyCreateInput, ExternalPartyUpdateInput } from "./schemas";

const CATEGORY_RESOURCE_SEGMENT: Record<ExternalPartyCategory, string> = {
  customer: "customers",
  supplier: "suppliers",
};

type ExternalPartyAction = "create" | "update" | "delete";

type CreateInput = { category: ExternalPartyCategory; body: ExternalPartyCreateInput; userId: number };
type UpdateInput = { category: ExternalPartyCategory; id: number; body: ExternalPartyUpdateInput; userId: number; expectedVersion?: number };
type DeleteInput = { category: ExternalPartyCategory; id: number; userId: number; expectedVersion?: number };

export function externalPartyBusinessActionKey(category: ExternalPartyCategory, action: ExternalPartyAction) {
  return `external.${CATEGORY_RESOURCE_SEGMENT[category]}.party.${action}`;
}

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

function duplicateError() {
  return serviceError("同一类别下编码不能重复", 409);
}

export async function listExternalParties(input: {
  category: ExternalPartyCategory;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  const rows = await prisma.externalParty.findMany({
    where: { category: input.category },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });
  const filtered = input.keyword
    ? rows.filter((row) => matchSearchFields(row, input.keyword || "", [
        "code", "name", "fullName", "classification", "identityNumber", "legalRepresentative",
        "contactPerson", "phone", "email", "bankName", "address", "invoiceTitle",
        "invoiceAddressPhone", "settlementTerms", "remark",
      ]))
    : rows;
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
}

export async function commitCreateExternalPartyCommand(command: ExternalPartyCreateCommand) {
  try {
    return await prisma.$transaction(async (tx) => {
      const duplicate = await tx.externalParty.findUnique({
        where: { category_code: { category: command.category, code: command.data.code } },
        select: { id: true },
      });
      if (duplicate) return duplicateError();
      const record = await tx.externalParty.create({
        data: {
          ...command.data,
          category: command.category,
          editedBy: command.userId,
          editedAt: new Date(),
        },
      });
      await snapshotHistory("ExternalParty", record.id, command.userId, tx);
      return serviceOk({ success: true, record });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return duplicateError();
    throw error;
  }
}

export async function commitUpdateExternalPartyCommand(command: ExternalPartyUpdateCommand) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.externalParty.findFirst({ where: { id: command.id, category: command.category } });
      if (!current) return serviceError("记录不存在", 404);
      if (current.version !== command.expectedVersion) return serviceError("记录已被其他人修改，请刷新后重试", 409);
      if (command.data.code && command.data.code !== current.code) {
        const duplicate = await tx.externalParty.findUnique({
          where: { category_code: { category: command.category, code: command.data.code } },
          select: { id: true },
        });
        if (duplicate) return duplicateError();
      }
      await ensureEditHistoryBaseline("ExternalParty", command.id, command.userId, tx);
      const record = await tx.externalParty.update({
        where: { id: command.id },
        data: {
          ...command.data,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await snapshotHistory("ExternalParty", command.id, command.userId, tx);
      return serviceOk({ success: true, record });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return duplicateError();
    throw error;
  }
}

export async function commitDeleteExternalPartyCommand(command: ExternalPartyDeleteCommand) {
  const result = await guardedDelete({
    entityType: "ExternalParty",
    modelKey: "externalParty",
    id: command.id,
    userId: command.userId,
    expectedVersion: command.expectedVersion,
    deleteMode: "hard",
    referencePolicy: "none",
    scopeGuard: ({ record }) => record.category === command.category
      ? { ok: true }
      : { error: "记录不存在", status: 404 },
  });
  return result.ok ? serviceOk({ success: true }) : serviceError(result.error, result.status || 400);
}

function createAdapter(category: ExternalPartyCategory) {
  return defineBusinessActionCommandAdapter({
    businessActionKey: externalPartyBusinessActionKey(category, "create"),
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyCreateCommand",
    commitKey: "packages/external/server/external-parties.commitCreateExternalPartyCommand",
    validate: (input: CreateInput) => {
      const command = buildExternalPartyCreateCommand(input.category, input.body, input.userId);
      return command.ok ? serviceOk(command.data) : validationError(command.issue);
    },
    commit: commitCreateExternalPartyCommand,
  });
}

function updateAdapter(category: ExternalPartyCategory) {
  return defineBusinessActionCommandAdapter({
    businessActionKey: externalPartyBusinessActionKey(category, "update"),
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyUpdateCommand",
    commitKey: "packages/external/server/external-parties.commitUpdateExternalPartyCommand",
    validate: (input: UpdateInput) => {
      const command = buildExternalPartyUpdateCommand(input.id, input.category, input.body, input.userId, input.expectedVersion);
      return command.ok ? serviceOk(command.data) : validationError(command.issue);
    },
    commit: commitUpdateExternalPartyCommand,
  });
}

function deleteAdapter(category: ExternalPartyCategory) {
  return defineBusinessActionCommandAdapter({
    businessActionKey: externalPartyBusinessActionKey(category, "delete"),
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyDeleteCommand",
    commitKey: "packages/external/server/external-parties.commitDeleteExternalPartyCommand",
    validate: (input: DeleteInput) => {
      const command = buildExternalPartyDeleteCommand(input.id, input.category, input.userId, input.expectedVersion);
      return command.ok ? serviceOk(command.data) : validationError(command.issue);
    },
    commit: commitDeleteExternalPartyCommand,
  });
}

export function executeCreateExternalPartyCommand(input: CreateInput) {
  return executeDirectBusinessActionCommand({ command: createAdapter(input.category), input, context: undefined, actorUserId: input.userId });
}

export function executeUpdateExternalPartyCommand(input: UpdateInput) {
  return executeDirectBusinessActionCommand({ command: updateAdapter(input.category), input, context: undefined, actorUserId: input.userId });
}

export function executeDeleteExternalPartyCommand(input: DeleteInput) {
  return executeDirectBusinessActionCommand({ command: deleteAdapter(input.category), input, context: undefined, actorUserId: input.userId });
}
