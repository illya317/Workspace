import { matchSearchFields } from "@workspace/platform/search";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { lockParty } from "@workspace/platform/server/party-directory";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  runSerializableTransaction,
  SerializableTransactionConflictError,
} from "@workspace/platform/server/serializable-transaction";
import type {
  ExternalPartyCategory,
  ExternalRelatedParty,
  ExternalRelatedPartyCandidateListResponse,
  ExternalRelatedPartyListResponse,
} from "@workspace/external/types";
import type {
  ExternalRelatedPartyCreateCommand,
  ExternalRelatedPartyDeleteCommand,
} from "./domain/related-party-validation";
import { resolveRelatedPartyProtection } from "./domain/related-party-protection";
import {
  projectExternalRelatedParty,
  projectExternalRelatedPartyCandidate,
} from "./related-party-projection";
import { loadRelatedPartyDefaults } from "./related-party-defaults";
import { touchExternalPartyAggregateInTransaction } from "./external-party-service";

const CATEGORY_RESOURCE_KEY: Record<ExternalPartyCategory, string> = {
  customer: "external.customers",
  supplier: "external.suppliers",
};

async function readableCandidateCategories(userId: number): Promise<ExternalPartyCategory[]> {
  const categories = Object.keys(CATEGORY_RESOURCE_KEY) as ExternalPartyCategory[];
  const permissions = await Promise.all(categories.map((category) => (
    evaluatePermissionAction(userId, CATEGORY_RESOURCE_KEY[category], "read")
  )));
  return categories.filter((_, index) => permissions[index]);
}

export async function listExternalRelatedParties(input: {
  keyword?: string;
  relatedPartyType?: ExternalRelatedParty["relatedPartyType"];
  page?: number;
  pageSize?: number;
  asOfDate?: string;
}): Promise<ExternalRelatedPartyListResponse> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  const asOfDate = input.asOfDate ?? workspaceBusinessDate(new Date());
  const defaults = await loadRelatedPartyDefaults(asOfDate);
  const rows = await prisma.party.findMany({
    where: {
      OR: [
        { id: { in: [...defaults.partyDefaults.keys()] } },
        { externalProfile: { is: { relatedPartyType: { not: "unrelated" } } } },
      ],
    },
    include: {
      externalProfile: true,
      externalRoles: true,
      legalFactRevisions: true,
      company: true,
      ownedInterests: true,
    },
  });
  const projected = [
    ...rows.map((row) => projectExternalRelatedParty(row, asOfDate, defaults.partyDefaults.get(row.id))),
    ...defaults.managementRows,
  ]
    .filter((row): row is ExternalRelatedParty => row !== null)
    .filter((row) => !input.relatedPartyType || row.relatedPartyType === input.relatedPartyType)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  const filtered = input.keyword
    ? projected.filter((row) => matchSearchFields(row, input.keyword ?? "", [
        "name", "fullName", "identityNumber", "legalRepresentative", "relatedPartyType",
      ]))
    : projected;
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    asOfDate,
  };
}

export async function listExternalRelatedPartyCandidates(input: {
  userId: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
  asOfDate?: string;
}): Promise<ExternalRelatedPartyCandidateListResponse> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  const asOfDate = input.asOfDate ?? workspaceBusinessDate(new Date());
  const visibleCategories = await readableCandidateCategories(input.userId);
  if (visibleCategories.length === 0) return { items: [], total: 0, page, pageSize, asOfDate };
  const rows = await prisma.party.findMany({
    where: {
      externalRoles: { some: { category: { in: visibleCategories } } },
      OR: [
        { externalProfile: { is: null } },
        { externalProfile: { is: { relatedPartyType: "unrelated" } } },
      ],
    },
    include: {
      externalProfile: true,
      externalRoles: true,
      legalFactRevisions: true,
      company: true,
      ownedInterests: true,
    },
  });
  const projected = rows
    .map((row) => projectExternalRelatedPartyCandidate(row, visibleCategories, asOfDate))
    .filter((row) => row !== null)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  const filtered = input.keyword
    ? projected.filter((row) => matchSearchFields(row, input.keyword ?? "", [
        "name", "fullName", "identityNumber",
      ]))
    : projected;
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    asOfDate,
  };
}

function relatedPartyWriteError(error: unknown) {
  if (error instanceof SerializableTransactionConflictError) {
    return serviceError("关联方维护发生并发冲突，请刷新后重试", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return serviceError("往来主体不存在", 404);
  }
  throw error;
}

export async function commitCreateExternalRelatedPartyCommand(command: ExternalRelatedPartyCreateCommand) {
  const visibleCategories = await readableCandidateCategories(command.userId);
  if (visibleCategories.length === 0) return serviceError("无权读取可登记的客户或供应商", 403);
  const asOfDate = workspaceBusinessDate(new Date());
  try {
    return await runSerializableTransaction(async (tx) => {
      if (!await lockParty(command.partyId, tx)) return serviceError("往来主体不存在", 404);
      const current = await tx.party.findFirst({
        where: {
          id: command.partyId,
          externalRoles: { some: { category: { in: visibleCategories } } },
        },
        include: {
          externalProfile: true,
          externalRoles: true,
          legalFactRevisions: true,
          company: true,
          ownedInterests: true,
        },
      });
      if (!current) return serviceError("该主体不在可读取的客户或供应商名单中", 403);
      const protection = resolveRelatedPartyProtection(current, asOfDate);
      if (protection.systemConfigured) {
        return serviceError(protection.systemConfiguredReason ?? "系统配置的关联方不可人工登记", 409);
      }
      if (current.externalProfile?.relatedPartyType === command.relatedPartyType) {
        const record = projectExternalRelatedParty(current, asOfDate);
        return record ? serviceOk({ success: true, record }) : serviceError("关联方投影失败", 409);
      }
      if (current.externalProfile?.relatedPartyType && current.externalProfile.relatedPartyType !== "unrelated") {
        return serviceError("该主体已登记为关联方，请刷新名单", 409);
      }
      if (current.version !== command.expectedVersion) {
        return serviceError("往来主体已被其他人修改，请刷新候选名单后重试", 409);
      }
      await ensureEditHistoryBaseline("Party", current.id, command.userId, tx);
      await tx.externalPartyProfile.upsert({
        where: { partyId: current.id },
        create: { partyId: current.id, relatedPartyType: command.relatedPartyType },
        update: { relatedPartyType: command.relatedPartyType },
      });
      await touchExternalPartyAggregateInTransaction(tx, {
        partyId: current.id,
        expectedVersion: command.expectedVersion,
        userId: command.userId,
      });
      const updated = await tx.party.findUniqueOrThrow({
        where: { id: current.id },
        include: {
          externalProfile: true,
          externalRoles: true,
          legalFactRevisions: true,
          company: true,
          ownedInterests: true,
        },
      });
      await snapshotHistory("Party", updated.id, command.userId, tx);
      const record = projectExternalRelatedParty(updated, asOfDate);
      return record ? serviceOk({ success: true, record }) : serviceError("关联方投影失败", 409);
    });
  } catch (error) {
    return relatedPartyWriteError(error);
  }
}

export async function commitDeleteExternalRelatedPartyCommand(command: ExternalRelatedPartyDeleteCommand) {
  const asOfDate = workspaceBusinessDate(new Date());
  try {
    return await runSerializableTransaction(async (tx) => {
      if (!await lockParty(command.partyId, tx)) return serviceError("关联方不存在", 404);
      const current = await tx.party.findUnique({
        where: { id: command.partyId },
        include: {
          externalProfile: true,
          externalRoles: true,
          legalFactRevisions: true,
          company: true,
          ownedInterests: true,
        },
      });
      if (!current || !current.externalProfile || current.externalProfile.relatedPartyType === "unrelated") {
        return serviceError("该主体已不是关联方，请刷新名单", 409);
      }
      const protection = resolveRelatedPartyProtection(current, asOfDate);
      if (protection.systemConfigured) {
        return serviceError(protection.systemConfiguredReason ?? "系统配置的关联方不可取消", 409);
      }
      if (current.version !== command.expectedVersion) {
        return serviceError("往来主体已被其他人修改，请刷新名单后重试", 409);
      }
      await ensureEditHistoryBaseline("Party", current.id, command.userId, tx);
      await tx.externalPartyProfile.update({
        where: { partyId: current.id },
        data: { relatedPartyType: "unrelated" },
      });
      const updated = await touchExternalPartyAggregateInTransaction(tx, {
        partyId: current.id,
        expectedVersion: command.expectedVersion,
        userId: command.userId,
      });
      await snapshotHistory("Party", updated.id, command.userId, tx);
      return serviceOk({ success: true, id: updated.id });
    });
  } catch (error) {
    return relatedPartyWriteError(error);
  }
}
