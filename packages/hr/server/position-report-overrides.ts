import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { businessTemporalIdempotencyMatches } from "@workspace/platform/server/business-temporal-idempotency";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  buildPositionReportOverrideSaveCommand,
  validateReportOverrideSourcePosition,
  type PositionReportOverrideInput,
} from "./domain/position-report-override-validation";
import { positionReportOverrideBatchRequestFingerprint } from "./domain/organization-structure-command";
import {
  applyPositionReportOverrideChange,
  createPositionReportOverrideWithInitialVersion,
  OrganizationStructureConcurrentUpdateError,
  OrganizationStructureIdempotencyConflictError,
  organizationTimeline,
  recordPositionReportOverrideBatchChange,
  runOrganizationStructureTransaction,
  type PositionReportOverridePayload,
} from "./organization-structure-lifecycle-service";

type PositionReportOverrideRecord = {
  id: number;
  positionId: number;
  companyId: number;
  company: { code: string; party: { name: string } } | null;
  departmentId: number;
  department: {
    code: string;
    name: string;
    parent: { code: string; name: string; parent: { code: string; name: string } | null } | null;
  };
  reportToPositionId: number | null;
  reportToPosition: { name: string } | null;
  headcount: number | null;
  isActive: boolean;
  version: number;
  _count: { edps: number };
  effectiveVersions: Array<{
    id: number;
    sequence: number;
    validFrom: string | null;
    validToExclusive: string | null;
    recordState: string;
    changeKind: string;
    supersedesId: number | null;
    reportToPositionId: number | null;
    headcount: number | null;
    remark: string | null;
    sourceChange: { reason: string | null; recordedAt: Date; actorUserId: number };
  }>;
};

export async function listPositionReportOverrides(positionId: number) {
  const asOfDate = workspaceBusinessDate(new Date());
  const source = mapValidationToServiceResult(await validateReportOverrideSourcePosition(positionId, { strict: false }));
  if (!source.ok) return source;

  const overrides = await prisma.positionReportOverride.findMany({
    where: { positionId },
    include: {
      company: { select: { id: true, code: true, party: { select: { name: true } } } },
      department: {
        select: {
          id: true,
          code: true,
          name: true,
          hierarchyKind: true,
          isArchived: true,
          parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
        },
      },
      reportToPosition: { select: { id: true, code: true, name: true } },
      _count: { select: { edps: true } },
      effectiveVersions: {
        orderBy: { sequence: "asc" },
        include: { sourceChange: { select: { reason: true, recordedAt: true, actorUserId: true } } },
      },
    },
    orderBy: [{ company: { code: "asc" } }, { department: { code: "asc" } }, { id: "asc" }],
  });

  return {
    position: source.data.position,
    isFunctionalPosition: source.data.functional,
    asOfDate,
    overrides: overrides.map((override) => toPositionReportOverrideDto(override, asOfDate)),
  };
}

function toPositionReportOverrideDto(override: PositionReportOverrideRecord, asOfDate: string) {
  const timeline = organizationTimeline(override.effectiveVersions.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    validFrom: row.validFrom,
    validToExclusive: row.validToExclusive,
    recordState: row.recordState,
    supersedesId: row.supersedesId,
    payload: overridePayload(row),
  })), asOfDate);
  const items = timeline.map((item) => {
    const source = override.effectiveVersions.find((row) => row.id === item.id);
    return {
      ...item,
      changeKind: source?.changeKind ?? "unknown",
      reason: source?.sourceChange.reason ?? null,
      recordedAt: source?.sourceChange.recordedAt.toISOString() ?? null,
      recordedBy: source?.sourceChange.actorUserId ?? null,
    };
  });
  const current = items.find((item) => item.isLive && item.temporalState === "current") ?? null;
  const effective = current?.payload ?? overridePayload(override);
  return {
    id: override.id,
    positionId: override.positionId,
    companyId: override.companyId,
    companyCode: override.company?.code ?? null,
    companyName: override.company?.party.name ?? null,
    departmentId: override.departmentId,
    departmentCode: override.department.code,
    departmentName: override.department.name,
    departmentPath: override.department.name,
    reportToPositionId: effective.reportToPositionId,
    reportToPositionName: override.reportToPosition?.name ?? null,
    headcount: effective.headcount,
    isActive: current !== null,
    version: override.version,
    edpCount: override._count.edps,
    asOfDate,
    temporal: {
      current,
      upcoming: items.filter((item) => item.isLive && item.temporalState === "upcoming"),
      history: items.filter((item) => !item.isLive || item.temporalState === "past"),
    },
  };
}

export async function savePositionReportOverrides(
  input: { positionId: number; overrides: PositionReportOverrideInput[]; lifecycle?: unknown },
  userId: number,
): Promise<ServiceResult<{ success: true }>> {
  const requestFingerprint = positionReportOverrideBatchRequestFingerprint({
    positionId: input.positionId,
    overrides: input.overrides,
    lifecycle: input.lifecycle,
  });
  const rawLifecycle = input.lifecycle && typeof input.lifecycle === "object"
    ? input.lifecycle as Record<string, unknown>
    : null;
  const rawIdempotencyKey = typeof rawLifecycle?.idempotencyKey === "string"
    ? rawLifecycle.idempotencyKey.trim()
    : "";
  if (rawIdempotencyKey) {
    const previous = await prisma.organizationStructureChange.findUnique({
      where: { idempotencyKey: rawIdempotencyKey },
    });
    if (previous) {
      try {
        assertPositionReportOverrideBatchReplay(previous, input.positionId, requestFingerprint);
      } catch (error) {
        if (error instanceof OrganizationStructureIdempotencyConflictError) {
          return serviceError(error.message, 409);
        }
        throw error;
      }
      return serviceOk({ success: true });
    }
  }

  const command = mapValidationToServiceResult(await buildPositionReportOverrideSaveCommand(input));
  if (!command.ok) return command;

  try {
    await runOrganizationStructureTransaction(async (tx) => {
      const previous = await tx.organizationStructureChange.findUnique({
        where: { idempotencyKey: command.data.lifecycle.idempotencyKey },
      });
      if (previous) {
        assertPositionReportOverrideBatchReplay(previous, command.data.positionId, requestFingerprint);
        return;
      }

      const existing = await tx.positionReportOverride.findMany({ where: { positionId: command.data.positionId } });
      const bySlot = new Map(existing.map((row) => [`${row.companyId}:${row.departmentId}`, row]));
      for (const id of command.data.deleteIds) {
        const row = existing.find((item) => item.id === id);
        if (!row || !row.isActive) continue;
        await applyPositionReportOverrideChange(tx, {
          overrideId: row.id,
          payload: overridePayload(row),
          meta: {
            ...command.data.lifecycle,
            kind: "end-date",
            expectedSequence: row.version,
            idempotencyKey: `${command.data.lifecycle.idempotencyKey}:end:${row.id}`,
            reason: command.data.lifecycle.reason ?? "从特殊汇报配置中移除",
          },
          userId,
        });
      }

      for (const override of command.data.overrides) {
        const slot = `${override.companyId}:${override.departmentId}`;
        const row = bySlot.get(slot);
        const payload: PositionReportOverridePayload = {
          reportToPositionId: override.reportToPositionId,
          headcount: override.headcount,
          remark: null,
        };
        if (!row) {
          await createPositionReportOverrideWithInitialVersion(tx, {
            positionId: command.data.positionId,
            companyId: override.companyId,
            departmentId: override.departmentId,
            payload,
            meta: {
              ...command.data.lifecycle,
              kind: "schedule",
              expectedSequence: 0,
              idempotencyKey: `${command.data.lifecycle.idempotencyKey}:create:${slot}`,
            },
            userId,
          });
          continue;
        }
        if (row.isActive && override.isActive !== false && sameOverridePayload(row, payload)) continue;
        if (!row.isActive && override.isActive === false) continue;
        if (override.version !== row.version) throw new OrganizationStructureConcurrentUpdateError();
        if (override.isActive === false) {
          await applyPositionReportOverrideChange(tx, {
            overrideId: row.id,
            payload,
            meta: {
              ...command.data.lifecycle,
              kind: "end-date",
              expectedSequence: row.version,
              idempotencyKey: `${command.data.lifecycle.idempotencyKey}:end:${row.id}`,
              reason: command.data.lifecycle.reason ?? "停用特殊汇报规则",
            },
            userId,
          });
          continue;
        }
        await applyPositionReportOverrideChange(tx, {
          overrideId: row.id,
          payload,
          meta: {
            ...command.data.lifecycle,
            expectedSequence: row.version,
            idempotencyKey: `${command.data.lifecycle.idempotencyKey}:change:${row.id}`,
          },
          userId,
        });
      }

      await recordPositionReportOverrideBatchChange(tx, {
        positionId: command.data.positionId,
        meta: command.data.lifecycle,
        userId,
        requestFingerprint,
        overrideCount: command.data.overrides.length,
        deletedIds: command.data.deleteIds,
      });
    });
  } catch (error) {
    if (
      error instanceof OrganizationStructureConcurrentUpdateError
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      const previous = await prisma.organizationStructureChange.findUnique({
        where: { idempotencyKey: command.data.lifecycle.idempotencyKey },
      });
      if (previous) {
        try {
          assertPositionReportOverrideBatchReplay(previous, command.data.positionId, requestFingerprint);
          return serviceOk({ success: true });
        } catch (replayError) {
          if (replayError instanceof OrganizationStructureIdempotencyConflictError) {
            return serviceError(replayError.message, 409);
          }
          throw replayError;
        }
      }
    }
    if (error instanceof OrganizationStructureConcurrentUpdateError) {
      return serviceError(error.message, 409);
    }
    if (error instanceof OrganizationStructureIdempotencyConflictError) {
      return serviceError(error.message, 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("特殊汇报规则已发生变化，请刷新后重试", 409);
    }
    throw error;
  }

  return serviceOk({ success: true });
}

function assertPositionReportOverrideBatchReplay(
  previous: { aggregateType: string; aggregateId: number; requestFingerprint: string },
  positionId: number,
  requestFingerprint: string,
) {
  if (
    previous.aggregateType !== "PositionReportOverrideBatch"
    || previous.aggregateId !== positionId
    || !businessTemporalIdempotencyMatches(previous.requestFingerprint, requestFingerprint)
  ) {
    throw new OrganizationStructureIdempotencyConflictError();
  }
}

function overridePayload(row: { reportToPositionId: number | null; headcount: number | null; remark: string | null }) {
  return {
    reportToPositionId: row.reportToPositionId,
    headcount: row.headcount,
    remark: row.remark,
  };
}

function sameOverridePayload(
  row: { reportToPositionId: number | null; headcount: number | null; remark: string | null },
  payload: PositionReportOverridePayload,
) {
  return row.reportToPositionId === payload.reportToPositionId
    && row.headcount === payload.headcount
    && row.remark === payload.remark;
}
