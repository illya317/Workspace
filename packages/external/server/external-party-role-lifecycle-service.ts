import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "@workspace/platform/server/business-temporal-idempotency";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { lockParty } from "@workspace/platform/server/party-directory";
import { Prisma } from "@workspace/platform/server/prisma";
import {
  runSerializableTransaction,
  SerializableTransactionConflictError,
} from "@workspace/platform/server/serializable-transaction";
import type { ExternalPartyCategory } from "@workspace/external/types";
import {
  assertExternalPartyRoleMutableData,
  type ExternalPartyRoleAvailabilityRouteCommand,
  type ExternalPartyRoleMutableData,
} from "./domain/external-party-validation";
import {
  buildExternalPartyRoleAvailabilityPlan,
  ExternalPartyRoleLifecycleError,
  resolveExternalPartyRoleAvailability,
  type ExternalPartyRoleAvailabilityCommand,
  type ExternalPartyRolePeriodSnapshot,
} from "./domain/external-party-role-lifecycle-validation";

type TransactionClient = Prisma.TransactionClient;

const periodSelect = {
  id: true,
  roleId: true,
  sequence: true,
  validFrom: true,
  validThrough: true,
  recordState: true,
  commandKind: true,
  supersedesId: true,
  reason: true,
  recordedAt: true,
} as const;

export type ExternalPartyRoleAvailabilityReceipt = {
  partyId: number;
  category: string;
  roleId: number;
  periodId: number;
  sequence: number;
  commandKind: string;
  availabilityVersion: number;
};

export async function createExternalPartyRoleInTransaction(
  tx: TransactionClient,
  input: {
    partyId: number;
    category: ExternalPartyCategory;
    roleData: ExternalPartyRoleMutableData & { code: string };
    validFrom: string | null;
    validThrough: string | null;
    userId: number;
    idempotencyKey: string;
    asOfDate: string;
  },
) {
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "ExternalPartyRole",
    commandKind: "create",
    request: {
      partyId: input.partyId,
      category: input.category,
      roleData: input.roleData,
      validFrom: input.validFrom,
      validThrough: input.validThrough,
      asOfDate: input.asOfDate,
    },
  });
  const duplicate = await tx.externalPartyRolePeriod.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { requestFingerprint: true, role: { select: { id: true, partyId: true, category: true } } },
  });
  if (duplicate) {
    if (
      duplicate.role.partyId !== input.partyId
      || duplicate.role.category !== input.category
      || !businessTemporalIdempotencyMatches(duplicate.requestFingerprint, requestFingerprint)
    ) {
      throw new ExternalPartyRoleLifecycleError("幂等键已用于其他角色生命周期命令");
    }
    return tx.externalPartyRole.findUniqueOrThrow({ where: { id: duplicate.role.id } });
  }
  const role = await tx.externalPartyRole.create({
    data: {
      partyId: input.partyId,
      category: input.category,
      ...input.roleData,
      isActive: false,
    },
  });
  const plan = buildExternalPartyRoleAvailabilityPlan({
    roleId: role.id,
    asOfDate: input.asOfDate,
    rows: [],
    command: {
      kind: "schedule",
      validFrom: input.validFrom,
      validThrough: input.validThrough,
      reason: "创建往来角色时登记可用期间",
    },
  });
  const period = await tx.externalPartyRolePeriod.create({
    data: { ...plan, idempotencyKey: input.idempotencyKey, requestFingerprint, recordedBy: input.userId },
    select: periodSelect,
  });
  return tx.externalPartyRole.update({
    where: { id: role.id },
    data: { isActive: Boolean(resolveExternalPartyRoleAvailability([toSnapshot(period)], input.asOfDate)) },
  });
}

export function updateExternalPartyRoleInTransaction(
  tx: TransactionClient,
  roleId: number,
  roleData: ExternalPartyRoleMutableData,
) {
  assertExternalPartyRoleMutableData(roleData);
  return tx.externalPartyRole.update({ where: { id: roleId }, data: roleData });
}

export async function appendExternalPartyRoleAvailabilityInTransaction(
  tx: TransactionClient,
  input: {
    roleId: number;
    asOfDate: string;
    command: ExternalPartyRoleAvailabilityCommand;
    userId: number;
    idempotencyKey: string;
    requestFingerprint?: string;
  },
): Promise<ExternalPartyRoleAvailabilityReceipt> {
  const requestFingerprint = input.requestFingerprint ?? businessTemporalRequestFingerprint({
    aggregate: "ExternalPartyRole",
    commandKind: "availability",
    request: { roleId: input.roleId, asOfDate: input.asOfDate, command: input.command },
  });
  const duplicate = await findIdempotentReceipt(tx, input.idempotencyKey, requestFingerprint);
  if (duplicate) {
    if (duplicate.roleId !== input.roleId) {
      throw new ExternalPartyRoleLifecycleError("幂等键已用于其他角色生命周期命令");
    }
    return duplicate;
  }
  const role = await tx.externalPartyRole.findUnique({
    where: { id: input.roleId },
    select: { id: true, partyId: true, category: true, availabilityVersion: true, availabilityPeriods: { select: periodSelect } },
  });
  if (!role) throw new ExternalPartyRoleLifecycleError("角色记录不存在");
  const rows = role.availabilityPeriods.map(toSnapshot);
  const plan = buildExternalPartyRoleAvailabilityPlan({
    roleId: role.id,
    asOfDate: input.asOfDate,
    rows,
    command: input.command,
  });
  const created = await tx.externalPartyRolePeriod.create({
    data: { ...plan, idempotencyKey: input.idempotencyKey, requestFingerprint, recordedBy: input.userId },
    select: periodSelect,
  });
  const updated = await tx.externalPartyRole.update({
    where: { id: role.id },
    data: {
      availabilityVersion: { increment: 1 },
      isActive: Boolean(resolveExternalPartyRoleAvailability([...rows, toSnapshot(created)], input.asOfDate)),
    },
    select: { availabilityVersion: true },
  });
  return {
    partyId: role.partyId,
    category: role.category,
    roleId: role.id,
    periodId: created.id,
    sequence: created.sequence,
    commandKind: created.commandKind,
    availabilityVersion: updated.availabilityVersion,
  };
}

export async function commitExternalPartyRoleAvailabilityCommand(
  routeCommand: ExternalPartyRoleAvailabilityRouteCommand,
) {
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "ExternalPartyRole",
    commandKind: "availability",
    request: {
      partyId: routeCommand.id,
      category: routeCommand.category,
      expectedVersion: routeCommand.expectedVersion,
      command: routeCommand.command,
    },
  });
  try {
    const receipt = await runSerializableTransaction(async (tx) => {
      const duplicate = await findIdempotentReceipt(tx, routeCommand.idempotencyKey, requestFingerprint);
      if (duplicate) {
        if (duplicate.partyId !== routeCommand.id || duplicate.category !== routeCommand.category) {
          throw new ExternalPartyRoleLifecycleError("幂等键已用于其他角色生命周期命令");
        }
        return duplicate;
      }
      if (!await lockParty(routeCommand.id, tx)) throw new ExternalPartyRoleLifecycleError("记录不存在");
      const party = await tx.party.findFirst({
        where: { id: routeCommand.id, externalRoles: { some: { category: routeCommand.category } } },
        select: {
          version: true,
          externalRoles: {
            where: { category: routeCommand.category },
            select: { id: true },
          },
        },
      });
      if (!party) throw new ExternalPartyRoleLifecycleError("角色记录不存在");
      if (party.version !== routeCommand.expectedVersion) {
        throw new ExternalPartyRoleLifecycleError("记录已被其他人修改，请刷新后重试");
      }
      const role = party.externalRoles[0];
      if (!role) throw new ExternalPartyRoleLifecycleError("角色记录不存在");
      await ensureEditHistoryBaseline("Party", routeCommand.id, routeCommand.userId, tx);
      await ensureEditHistoryBaseline("ExternalPartyRole", role.id, routeCommand.userId, tx);
      const receipt = await appendExternalPartyRoleAvailabilityInTransaction(tx, {
        roleId: role.id,
        asOfDate: workspaceBusinessDate(new Date()),
        command: routeCommand.command,
        userId: routeCommand.userId,
        idempotencyKey: routeCommand.idempotencyKey,
        requestFingerprint,
      });
      await tx.party.update({
        where: { id: routeCommand.id },
        data: { editedBy: routeCommand.userId, editedAt: new Date(), version: { increment: 1 } },
      });
      await snapshotHistory("Party", routeCommand.id, routeCommand.userId, tx);
      await snapshotHistory("ExternalPartyRole", role.id, routeCommand.userId, tx);
      return receipt;
    });
    return serviceOk({ success: true, receipt });
  } catch (error) {
    if (error instanceof ExternalPartyRoleLifecycleError) return serviceError(error.message, 409);
    if (error instanceof SerializableTransactionConflictError) return serviceError(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("角色生命周期命令冲突，请刷新后重试", 409);
    }
    throw error;
  }
}

async function findIdempotentReceipt(tx: TransactionClient, idempotencyKey: string, requestFingerprint: string) {
  const row = await tx.externalPartyRolePeriod.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      roleId: true,
      sequence: true,
      commandKind: true,
      requestFingerprint: true,
      role: { select: { partyId: true, category: true, availabilityVersion: true } },
    },
  });
  if (row && !businessTemporalIdempotencyMatches(row.requestFingerprint, requestFingerprint)) {
    throw new ExternalPartyRoleLifecycleError("幂等键已用于不同的角色生命周期命令");
  }
  return row ? {
    partyId: row.role.partyId,
    category: row.role.category,
    roleId: row.roleId,
    periodId: row.id,
    sequence: row.sequence,
    commandKind: row.commandKind,
    availabilityVersion: row.role.availabilityVersion,
  } : null;
}

function toSnapshot(row: {
  id: number;
  roleId: number;
  sequence: number;
  validFrom: string | null;
  validThrough: string | null;
  recordState: string;
  commandKind: string;
  supersedesId: number | null;
  reason: string | null;
  recordedAt: Date;
}): ExternalPartyRolePeriodSnapshot {
  return { ...row, recordedAt: row.recordedAt.toISOString() };
}
