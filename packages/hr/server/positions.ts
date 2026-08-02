import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import {
  type CrudDeleteCommand,
  type CrudUpdateFieldCommand,
} from "./hr-crud";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { getCompanyNameSync, loadCompanyMap } from "@workspace/platform/server/company-directory";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "@workspace/platform/server/business-temporal-idempotency";
import {
  buildPositionCreateCommand,
  buildPositionUpdateCommand,
  validatePositionDelete,
  validatePositionFieldUpdate,
  type PositionCreateCommand,
  type PositionInput,
  type PositionUpdateCommand,
} from "./domain/position-validation";
import { createPositionDescriptionInTx } from "./position-description-revision-service";
import {
  applyPositionStructureChange,
  createPositionWithInitialVersion,
  OrganizationStructureConcurrentUpdateError,
  OrganizationStructureIdempotencyConflictError,
  organizationTimeline,
  runOrganizationStructureTransaction,
  type PositionStructurePayload,
} from "./organization-structure-lifecycle-service";

export interface PositionListItem {
  id: number;
  code: string;
  codeRaw: string | null;
  name: string;
  alias: string | null;
  company: string;
  departmentId: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  positionDescriptionId: number | null;
  positionDescriptionName: string | null;
  positionDescriptionCode: string | null;
  positionDescriptionDepartmentName: string | null;
  positionDescriptionDetails: Record<string, unknown> | null;
  reportTo: string | null;
  reportToPositionId: number | null;
  summary: string | null;
  positionPurpose: string | null;
  headcountPlan: number | null;
  version: number;
  positionDescriptionVersion: string | null;
  positionDescriptionSequence: number | null;
  effectiveDate: string | null;
  sourceFile: string | null;
  headcount: number;
  positionReportOverrideCount: number;
  isArchived: boolean;
  archivedAt: string | null;
}

function parsePositionDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function selectedDetails(record: object | null | undefined): string | null {
  if (!record || !("details" in record)) return null;
  return typeof record.details === "string" ? record.details : null;
}

export async function getPositionList(
  keyword: string,
  page: number,
  pageSize: number,
  archived = false,
  summary = false,
): Promise<{ positions: PositionListItem[]; total: number; asOfDate: string }> {
  const asOfDate = workspaceBusinessDate(new Date());
  const [positions, companyMap] = await Promise.all([
    prisma.position.findMany({
      include: {
        _count: { select: { edps: true, reportOverrides: true } },
        department: { select: { id: true, code: true, name: true } },
        reportToPosition: { select: { name: true } },
        positionDescription: {
          select: {
            id: true,
            revisions: {
              where: { OR: [{ effectiveDate: null }, { effectiveDate: { lte: asOfDate } }] },
              orderBy: [{ effectiveDate: { sort: "desc", nulls: "last" } }, { sequence: "desc" }],
              take: 1,
              select: summary
                ? {
                    sequence: true,
                    summary: true,
                    positionPurpose: true,
                    headcount: true,
                    version: true,
                    effectiveDate: true,
                    sourceFile: true,
                  }
                : {
                    sequence: true,
                    summary: true,
                    positionPurpose: true,
                    headcount: true,
                    version: true,
                    effectiveDate: true,
                    sourceFile: true,
                    details: true,
                  },
            },
          },
        },
        effectiveVersions: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            sequence: true,
            validFrom: true,
            validToExclusive: true,
            recordState: true,
            changeKind: true,
            supersedesId: true,
            code: true,
            name: true,
            alias: true,
            departmentId: true,
            reportToPositionId: true,
            sourceChange: { select: { reason: true, recordedAt: true, actorUserId: true } },
          },
        },
      },
      orderBy: archived ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    }),
    loadCompanyMap(),
  ]);

  let result = positions.map((position) => {
    const revision = position.positionDescription?.revisions[0] ?? null;
    let codeRaw: string | null = null;
    const rawDetails = selectedDetails(revision);
    const positionDescriptionDetails = parsePositionDetails(rawDetails || null);
    if (rawDetails) {
      codeRaw = typeof positionDescriptionDetails?.code_raw === "string" ? positionDescriptionDetails.code_raw : null;
    }
    const timeline = organizationTimeline(position.effectiveVersions.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      validFrom: row.validFrom,
      validToExclusive: row.validToExclusive,
      recordState: row.recordState,
      supersedesId: row.supersedesId,
      payload: positionPayload(row),
    })), asOfDate);
    const temporalItems = timeline.map((item) => {
      const source = position.effectiveVersions.find((row) => row.id === item.id);
      return {
        ...item,
        changeKind: source?.changeKind ?? "unknown",
        reason: source?.sourceChange.reason ?? null,
        recordedAt: source?.sourceChange.recordedAt.toISOString() ?? null,
        recordedBy: source?.sourceChange.actorUserId ?? null,
      };
    });
    const currentTemporal = temporalItems.find((item) => item.isLive && item.temporalState === "current") ?? null;
    const effective = currentTemporal?.payload ?? positionPayload(position);
    return {
      id: position.id,
      code: effective.code,
      codeRaw,
      name: effective.name,
      alias: effective.alias || null,
      company: getCompanyNameSync(companyMap, effective.code),
      departmentId: effective.departmentId,
      departmentCode: position.department?.code || null,
      departmentName: position.department?.name || null,
      positionDescriptionId: position.positionDescriptionId,
      positionDescriptionName: position.positionDescription ? effective.name : null,
      positionDescriptionCode: position.positionDescription ? effective.code : null,
      positionDescriptionDepartmentName: position.positionDescription ? position.department?.name || null : null,
      positionDescriptionDetails,
      reportTo: position.reportToPosition?.name || null,
      reportToPositionId: effective.reportToPositionId || null,
      summary: revision?.summary || null,
      positionPurpose: revision?.positionPurpose || null,
      headcountPlan: revision?.headcount || null,
      version: position.version,
      asOfDate,
      temporal: {
        current: currentTemporal,
        upcoming: temporalItems.filter((item) => item.isLive && item.temporalState === "upcoming"),
        history: temporalItems.filter((item) => !item.isLive || item.temporalState === "past"),
      },
      positionDescriptionVersion: revision?.version || null,
      positionDescriptionSequence: revision?.sequence ?? null,
      effectiveDate: revision?.effectiveDate || null,
      sourceFile: revision?.sourceFile || null,
      headcount: position._count.edps,
      positionReportOverrideCount: position._count.reportOverrides,
      functionalPlacementCount: position._count.reportOverrides,
      isArchived: currentTemporal === null,
      archivedAt: position.archivedAt?.toISOString() || null,
    };
  });

  result = result.filter((position) => position.isArchived === archived);

  if (keyword) result = result.filter((position) => matchAnyField(position, keyword, "Position"));

  const total = result.length;
  const start = (page - 1) * pageSize;
  return { positions: result.slice(start, start + pageSize), total, asOfDate };
}

export async function commitPositionCreateCommand(
  command: PositionCreateCommand,
  userId: number,
): Promise<DomainServiceResult<{ success: true; record: { id: number } }>> {
  try {
    const record = await runOrganizationStructureTransaction(async (tx) => {
      const { positionDescription, lifecycle, ...positionData } = command;
      const requestFingerprint = organizationRouteFingerprint("Position", "create", {
        positionData,
        positionDescription,
        lifecycle,
      });
      const duplicate = await tx.organizationStructureChange.findUnique({ where: { idempotencyKey: lifecycle.idempotencyKey } });
      if (duplicate) {
        if (
          duplicate.aggregateType !== "Position"
          || !businessTemporalIdempotencyMatches(duplicate.requestFingerprint, requestFingerprint)
        ) throw new OrganizationStructureIdempotencyConflictError();
        return { id: duplicate.aggregateId };
      }
      const description = await createPositionDescriptionInTx(tx, positionDescription, userId);
      const position = await createPositionWithInitialVersion(
        tx,
        positionData,
        lifecycle,
        userId,
        { positionDescriptionId: description.id },
        requestFingerprint,
      );
      await snapshotHistory("Position", position.id, userId, tx);
      return { id: position.id };
    });
    return serviceOk({ success: true, record });
  } catch (error: unknown) {
    if (error instanceof OrganizationStructureConcurrentUpdateError) return serviceError(error.message, 409);
    if (error instanceof OrganizationStructureIdempotencyConflictError) return serviceError(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("岗位编码已存在", 409);
    }
    throw error;
  }
}

export async function commitPositionUpdateCommand(
  command: PositionUpdateCommand,
  userId: number,
): Promise<DomainServiceResult<{ success: true; position: unknown }>> {
  const data: Prisma.PositionUncheckedUpdateInput = { ...command.data };

  try {
    if (command.positionDescription) {
      const current = await prisma.position.findUnique({ where: { id: command.id }, select: { positionDescriptionId: true } });
      if (!current) return serviceError("岗位不存在", 404);
      if (current.positionDescriptionId) return serviceError("岗位已有说明书", 409);
    }
    const updated = await runOrganizationStructureTransaction(async (tx) => {
      const requestFingerprint = organizationRouteFingerprint("Position", "update", command as unknown as Record<string, unknown>);
      const duplicate = await tx.organizationStructureChange.findUnique({ where: { idempotencyKey: command.lifecycle.idempotencyKey } });
      if (duplicate) {
        if (
          duplicate.aggregateType !== "Position"
          || duplicate.aggregateId !== command.id
          || !businessTemporalIdempotencyMatches(duplicate.requestFingerprint, requestFingerprint)
        ) throw new OrganizationStructureIdempotencyConflictError();
        return tx.position.findUniqueOrThrow({ where: { id: command.id } });
      }
      const current = await tx.position.findUnique({ where: { id: command.id } });
      if (!current) throw new Error("岗位不存在");
      if (command.positionDescription) {
        const description = await createPositionDescriptionInTx(tx, command.positionDescription, userId);
        await tx.position.update({ where: { id: command.id }, data: { positionDescriptionId: description.id } });
      }
      const position = await applyPositionStructureChange(tx, {
        positionId: command.id,
        payload: mergePositionPayload(current, data),
        meta: command.lifecycle,
        userId,
        requestFingerprint,
      });
      await snapshotHistory("Position", command.id, userId, tx);
      return position;
    });
    return serviceOk({ success: true, position: updated });
  } catch (error: unknown) {
    if (error instanceof OrganizationStructureConcurrentUpdateError) return serviceError(error.message, 409);
    if (error instanceof OrganizationStructureIdempotencyConflictError) return serviceError(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("岗位编码已存在", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return serviceError("岗位不存在", 404);
    }
    throw error;
  }
}

function organizationRouteFingerprint(aggregate: string, commandKind: string, value: Record<string, unknown>) {
  const lifecycle = value.lifecycle && typeof value.lifecycle === "object"
    ? Object.fromEntries(Object.entries(value.lifecycle as Record<string, unknown>).filter(([key]) => key !== "idempotencyKey"))
    : value.lifecycle;
  return businessTemporalRequestFingerprint({ aggregate, commandKind, request: { ...value, lifecycle } });
}

function positionPayload(position: {
  code: string;
  name: string;
  alias: string | null;
  departmentId: number | null;
  reportToPositionId: number | null;
}): PositionStructurePayload {
  return {
    code: position.code,
    name: position.name,
    alias: position.alias,
    departmentId: position.departmentId,
    reportToPositionId: position.reportToPositionId,
  };
}

function mergePositionPayload(
  position: Parameters<typeof positionPayload>[0],
  data: Prisma.PositionUncheckedUpdateInput,
): PositionStructurePayload {
  const raw = data as Record<string, unknown>;
  const current = positionPayload(position);
  return {
    code: typeof raw.code === "string" ? raw.code : current.code,
    name: typeof raw.name === "string" ? raw.name : current.name,
    alias: raw.alias === null || typeof raw.alias === "string" ? raw.alias : current.alias,
    departmentId: raw.departmentId === null || typeof raw.departmentId === "number" ? raw.departmentId : current.departmentId,
    reportToPositionId: raw.reportToPositionId === null || typeof raw.reportToPositionId === "number" ? raw.reportToPositionId : current.reportToPositionId,
  };
}

type PositionCreateInput = { body: PositionInput; userId: number };
type PositionUpdateInput = { id: number; body: PositionInput; userId: number };
type PositionCommandContext = { userId: number };

const positionCreateAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "hr.roster.position.create",
  validatorKey: "packages/hr/server/domain/position-validation.buildPositionCreateCommand",
  commitKey: "packages/hr/server/positions.commitPositionCreateCommand",
  validate: async (input: PositionCreateInput) => mapValidationToServiceResult(
    await buildPositionCreateCommand(input.body),
  ),
  commit: (command: PositionCreateCommand, context: PositionCommandContext) => (
    commitPositionCreateCommand(command, context.userId)
  ),
});

const positionUpdateAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "hr.roster.position.update",
  validatorKey: "packages/hr/server/domain/position-validation.buildPositionUpdateCommand",
  commitKey: "packages/hr/server/positions.commitPositionUpdateCommand",
  validate: async (input: PositionUpdateInput) => mapValidationToServiceResult(
    await buildPositionUpdateCommand(input.id, input.body),
  ),
  commit: (
    command: PositionUpdateCommand,
    context: PositionCommandContext,
  ) => commitPositionUpdateCommand(command, context.userId),
});

export function createPosition(input: PositionInput, userId: number) {
  return executeDirectBusinessActionCommand({
    command: positionCreateAdapter,
    input: { body: input, userId },
    context: { userId },
    actorUserId: userId,
  });
}

export function updatePosition(id: number, body: PositionInput, userId: number) {
  return executeDirectBusinessActionCommand({
    command: positionUpdateAdapter,
    input: { id, body, userId },
    context: { userId },
    actorUserId: userId,
  });
}

export async function updatePositionField(command: CrudUpdateFieldCommand & { userId: number; lifecycle: PositionInput["lifecycle"] }) {
  const validation = await validatePositionFieldUpdate(command.field, command.value, command.id);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  if (!command.id) return serviceError("岗位不存在", 404);
  return updatePosition(command.id, {
    [validation.data.field]: validation.data.value,
    lifecycle: command.lifecycle,
  } as PositionInput, command.userId);
}

export async function deletePosition(command: CrudDeleteCommand) {
  const validation = await validatePositionDelete(command.id, "终止岗位");
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  return serviceError("岗位不允许硬删除，请使用带生效日和原因的 end-date 命令", 409);
}
