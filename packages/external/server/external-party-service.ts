import { matchSearchFields } from "@workspace/platform/search";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import type { ExternalPartyCategory } from "@workspace/external/types";
import type {
  ExternalPartyCreateCommand,
  ExternalPartyDeleteCommand,
  ExternalPartySubjectMutableData,
  ExternalPartyUpdateCommand,
} from "./domain/external-party-validation";
import { projectExternalParty, type ExternalPartyWithRoles } from "./external-party-projection";

const CATEGORY_RESOURCE_KEY: Record<ExternalPartyCategory, string> = {
  customer: "external.customers",
  supplier: "external.suppliers",
};

function oppositeCategory(category: ExternalPartyCategory): ExternalPartyCategory {
  return category === "customer" ? "supplier" : "customer";
}

async function visibleRoleCategories(userId: number, category: ExternalPartyCategory) {
  const opposite = oppositeCategory(category);
  const canReadOpposite = await evaluatePermissionAction(userId, CATEGORY_RESOURCE_KEY[opposite], "read");
  return canReadOpposite ? [category, opposite] : [category];
}

function mapWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = String(error.meta?.target ?? "");
    if (target.includes("subjectType") || target.includes("identityNumber")) {
      return serviceError("证件号码已属于其他往来主体", 409);
    }
    return serviceError("同一角色下编码不能重复", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return serviceError("记录不存在", 404);
  }
  throw error;
}

function projectedRecord(
  party: ExternalPartyWithRoles,
  category: ExternalPartyCategory,
  visibleCategories: readonly ExternalPartyCategory[],
) {
  const record = projectExternalParty(party, category, visibleCategories);
  return record ? serviceOk({ success: true, record }) : serviceError("角色记录不存在", 404);
}

async function lockExternalParty(tx: Prisma.TransactionClient, id: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT "id" FROM "ExternalParty" WHERE "id" = ${id} FOR UPDATE`,
  );
  return rows.length > 0;
}

export async function listExternalParties(input: {
  category: ExternalPartyCategory;
  userId: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  const visibleCategories = await visibleRoleCategories(input.userId, input.category);
  const rows = await prisma.externalParty.findMany({
    where: { roles: { some: { category: input.category } } },
    include: { roles: true },
  });
  const projected = rows
    .map((row) => projectExternalParty(row, input.category, visibleCategories))
    .filter((row) => row !== null)
    .sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.code.localeCompare(right.code, "zh-CN"));
  const filtered = input.keyword
    ? projected.filter((row) => matchSearchFields(row, input.keyword || "", [
        "code", "name", "fullName", "classification", "identityNumber", "legalRepresentative",
        "contactPerson", "phone", "email", "bankName", "address", "invoiceTitle",
        "invoiceAddressPhone", "settlementTerms", "remark",
      ]))
    : projected;
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
}

async function resolveCreateSubject(command: ExternalPartyCreateCommand, tx: Prisma.TransactionClient) {
  if (command.existingPartyId) {
    await lockExternalParty(tx, command.existingPartyId);
    const party = await tx.externalParty.findUnique({
      where: { id: command.existingPartyId },
      include: { roles: true },
    });
    return { party, explicit: true, ambiguous: false };
  }
  const identityNumber = command.subjectData.identityNumber;
  if (!identityNumber) return { party: null, explicit: false, ambiguous: false };
  const matches = await tx.externalParty.findMany({
    where: {
      subjectType: command.subjectData.subjectType,
      identityNumber,
    },
    include: { roles: true },
    take: 2,
  });
  if (matches[0]) {
    await lockExternalParty(tx, matches[0].id);
    const party = await tx.externalParty.findUnique({
      where: { id: matches[0].id },
      include: { roles: true },
    });
    return { party, explicit: false, ambiguous: matches.length > 1 };
  }
  return { party: null, explicit: false, ambiguous: false };
}

export async function commitCreateExternalPartyCommand(command: ExternalPartyCreateCommand) {
  const visibleCategories = await visibleRoleCategories(command.userId, command.category);
  try {
    return await prisma.$transaction(async (tx) => {
      const resolved = await resolveCreateSubject(command, tx);
      if (resolved.ambiguous) return serviceError("证件号码对应多个主体，请先完成主数据合并", 409);
      if (resolved.explicit && !resolved.party) return serviceError("关联主体不存在", 404);
      if (resolved.party) {
        if (resolved.party.roles.some((role) => role.category === command.category)) {
          return serviceError("该主体已具有当前角色", 409);
        }
        if (resolved.party.roles.some((role) => !visibleCategories.includes(role.category as ExternalPartyCategory))) {
          return serviceError("无权关联该往来主体", 403);
        }
        await ensureEditHistoryBaseline("ExternalParty", resolved.party.id, command.userId, tx);
        await tx.externalPartyRole.create({
          data: { partyId: resolved.party.id, category: command.category, ...command.roleData },
        });
        const party = await tx.externalParty.update({
          where: { id: resolved.party.id },
          data: { editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
          include: { roles: true },
        });
        await snapshotHistory("ExternalParty", party.id, command.userId, tx);
        return projectedRecord(party, command.category, visibleCategories);
      }
      const party = await tx.externalParty.create({
        data: {
          ...command.subjectData,
          editedBy: command.userId,
          editedAt: new Date(),
          roles: { create: { category: command.category, ...command.roleData } },
        },
        include: { roles: true },
      });
      await snapshotHistory("ExternalParty", party.id, command.userId, tx);
      return projectedRecord(party, command.category, visibleCategories);
    });
  } catch (error) {
    return mapWriteError(error);
  }
}

function changedSubjectData(
  data: ExternalPartySubjectMutableData,
  current: ExternalPartyWithRoles,
): ExternalPartySubjectMutableData {
  return {
    ...(data.subjectType !== undefined && data.subjectType !== current.subjectType ? { subjectType: data.subjectType } : {}),
    ...(data.relatedPartyType !== undefined && data.relatedPartyType !== current.relatedPartyType
      ? { relatedPartyType: data.relatedPartyType }
      : {}),
    ...(data.name !== undefined && data.name !== current.name ? { name: data.name } : {}),
    ...(data.fullName !== undefined && data.fullName !== current.fullName ? { fullName: data.fullName } : {}),
    ...(data.identityNumber !== undefined && data.identityNumber !== current.identityNumber
      ? { identityNumber: data.identityNumber }
      : {}),
    ...(data.legalRepresentative !== undefined && data.legalRepresentative !== current.legalRepresentative
      ? { legalRepresentative: data.legalRepresentative }
      : {}),
  };
}

async function conflictingIdentity(command: ExternalPartyUpdateCommand, current: ExternalPartyWithRoles, tx: Prisma.TransactionClient) {
  const subjectType = command.subjectData.subjectType ?? current.subjectType;
  const identityNumber = command.subjectData.identityNumber === undefined
    ? current.identityNumber
    : command.subjectData.identityNumber;
  if (!identityNumber) return false;
  return Boolean(await tx.externalParty.findFirst({
    where: {
      id: { not: current.id },
      subjectType,
      identityNumber,
    },
    select: { id: true },
  }));
}

export async function commitUpdateExternalPartyCommand(command: ExternalPartyUpdateCommand) {
  const opposite = oppositeCategory(command.category);
  const [visibleCategories, canUpdateOpposite] = await Promise.all([
    visibleRoleCategories(command.userId, command.category),
    evaluatePermissionAction(command.userId, CATEGORY_RESOURCE_KEY[opposite], "update"),
  ]);
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockExternalParty(tx, command.id)) return serviceError("记录不存在", 404);
      const current = await tx.externalParty.findFirst({
        where: { id: command.id, roles: { some: { category: command.category } } },
        include: { roles: true },
      });
      if (!current) return serviceError("记录不存在", 404);
      if (current.version !== command.expectedVersion) return serviceError("记录已被其他人修改，请刷新后重试", 409);
      const subjectData = changedSubjectData(command.subjectData, current);
      const changesSharedSubject = Object.keys(subjectData).length > 0;
      const hasOppositeRole = current.roles.some((role) => role.category === opposite);
      if (changesSharedSubject && hasOppositeRole && !canUpdateOpposite) {
        return serviceError("修改公共主体资料需要同时拥有客户和供应商修改权限", 403);
      }
      if (await conflictingIdentity({ ...command, subjectData }, current, tx)) {
        return serviceError("证件号码已属于其他往来主体", 409);
      }
      await ensureEditHistoryBaseline("ExternalParty", current.id, command.userId, tx);
      if (Object.keys(command.roleData).length > 0) {
        await tx.externalPartyRole.update({
          where: { partyId_category: { partyId: current.id, category: command.category } },
          data: command.roleData,
        });
      }
      const party = await tx.externalParty.update({
        where: { id: current.id },
        data: {
          ...subjectData,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
        include: { roles: true },
      });
      await snapshotHistory("ExternalParty", party.id, command.userId, tx);
      return projectedRecord(party, command.category, visibleCategories);
    });
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function commitDeleteExternalPartyCommand(command: ExternalPartyDeleteCommand) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockExternalParty(tx, command.id)) return serviceError("记录不存在", 404);
      const current = await tx.externalParty.findFirst({
        where: { id: command.id, roles: { some: { category: command.category } } },
        include: { roles: true },
      });
      if (!current) return serviceError("记录不存在", 404);
      if (current.version !== command.expectedVersion) return serviceError("记录已被其他人修改，请刷新后重试", 409);
      await ensureEditHistoryBaseline("ExternalParty", current.id, command.userId, tx);
      await snapshotHistory("ExternalParty", current.id, command.userId, tx);
      await tx.externalPartyRole.delete({
        where: { partyId_category: { partyId: current.id, category: command.category } },
      });
      if (current.roles.length === 1) {
        await tx.externalParty.delete({ where: { id: current.id } });
      } else {
        const party = await tx.externalParty.update({
          where: { id: current.id },
          data: { editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        await snapshotHistory("ExternalParty", party.id, command.userId, tx);
      }
      return serviceOk({ success: true });
    });
  } catch (error) {
    return mapWriteError(error);
  }
}
