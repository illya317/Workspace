import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import {
  executeDelete,
  executeUpdateField,
  type CrudDeleteCommand,
  type CrudUpdateFieldCommand,
} from "./hr-crud";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { getCompanyNameSync, loadCompanyMap } from "@workspace/platform/server/company-directory";
import {
  buildPositionCreateCommand,
  buildPositionUpdateCommand,
  POSITION_ALLOWED_FIELDS,
  validatePositionDelete,
  validatePositionFieldUpdate,
  type PositionCreateCommand,
  type PositionInput,
  type PositionUpdateCommand,
} from "./domain/position-validation";
import { syncPositionDescriptionResponsibilityNodesInTx } from "./position-responsibility-nodes";

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
  effectiveDate: string | null;
  sourceFile: string | null;
  headcount: number;
  positionReportOverrideCount: number;
  isArchived: boolean;
  archivedAt: string | null;
}

const POSITION_CONFIG = {
  entityType: "Position",
  modelKey: "position" as const,
  allowedFields: POSITION_ALLOWED_FIELDS,
  deleteMode: "hard" as const,
  onBeforeUpdate: validatePositionFieldUpdate,
  onBeforeDelete: async (id: number) => {
    const validation = await validatePositionDelete(id, "删除岗位");
    return validation.ok ? { ok: true as const } : { error: validation.issue.message, status: validation.issue.status };
  },
};

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
): Promise<{ positions: PositionListItem[]; total: number }> {
  const [positions, companyMap] = await Promise.all([
    prisma.position.findMany({
      where: { isArchived: archived },
      include: {
        _count: { select: { edps: true, reportOverrides: true } },
        department: { select: { id: true, code: true, name: true } },
        reportToPosition: { select: { name: true } },
        positionDescription: {
          select: summary
            ? {
                id: true,
                summary: true,
                positionPurpose: true,
                headcount: true,
                version: true,
                effectiveDate: true,
                sourceFile: true,
              }
            : {
                id: true,
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
      orderBy: archived ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    }),
    loadCompanyMap(),
  ]);

  let result = positions.map((position) => {
    let codeRaw: string | null = null;
    const rawDetails = selectedDetails(position.positionDescription);
    const positionDescriptionDetails = parsePositionDetails(rawDetails || null);
    if (rawDetails) {
      codeRaw = typeof positionDescriptionDetails?.code_raw === "string" ? positionDescriptionDetails.code_raw : null;
    }
    return {
      id: position.id,
      code: position.code,
      codeRaw,
      name: position.name,
      alias: position.alias || null,
      company: getCompanyNameSync(companyMap, position.code),
      departmentId: position.departmentId,
      departmentCode: position.department?.code || null,
      departmentName: position.department?.name || null,
      positionDescriptionId: position.positionDescriptionId,
      positionDescriptionName: position.positionDescription ? position.name : null,
      positionDescriptionCode: position.positionDescription ? position.code : null,
      positionDescriptionDepartmentName: position.positionDescription ? position.department?.name || null : null,
      positionDescriptionDetails,
      reportTo: position.reportToPosition?.name || null,
      reportToPositionId: position.reportToPositionId || null,
      summary: position.positionDescription?.summary || null,
      positionPurpose: position.positionDescription?.positionPurpose || null,
      headcountPlan: position.positionDescription?.headcount || null,
      version: position.version,
      positionDescriptionVersion: position.positionDescription?.version || null,
      effectiveDate: position.positionDescription?.effectiveDate || null,
      sourceFile: position.positionDescription?.sourceFile || null,
      headcount: position._count.edps,
      positionReportOverrideCount: position._count.reportOverrides,
      functionalPlacementCount: position._count.reportOverrides,
      isArchived: position.isArchived,
      archivedAt: position.archivedAt?.toISOString() || null,
    };
  });

  if (keyword) result = result.filter((position) => matchAnyField(position, keyword, "Position"));

  const total = result.length;
  const start = (page - 1) * pageSize;
  return { positions: result.slice(start, start + pageSize), total };
}

export async function commitPositionCreateCommand(
  command: PositionCreateCommand,
  userId: number,
): Promise<DomainServiceResult<{ success: true; record: { id: number } }>> {
  try {
    const record = await prisma.$transaction(async (tx) => {
      const { positionDescription, ...positionData } = command;
      const description = await tx.positionDescription.create({
        data: positionDescription
          ? { ...positionDescription, editedBy: userId, editedAt: new Date() }
          : {
            sourceFile: "",
            details: "{}",
            editedBy: userId,
            editedAt: new Date(),
          },
      });
      await syncPositionDescriptionResponsibilityNodesInTx(tx, description);
      const position = await tx.position.create({
        data: { ...positionData, positionDescriptionId: description.id, editedBy: userId },
        select: { id: true },
      });
      await snapshotHistory("Position", position.id, userId, tx);
      return position;
    });
    return serviceOk({ success: true, record });
  } catch (error: unknown) {
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
  const data: Prisma.PositionUncheckedUpdateInput = {
    ...command.data,
    editedBy: userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };

  try {
    if (command.positionDescription) {
      const current = await prisma.position.findUnique({ where: { id: command.id }, select: { positionDescriptionId: true } });
      if (!current) return serviceError("岗位不存在", 404);
      if (current.positionDescriptionId) return serviceError("岗位已有说明书", 409);
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (command.positionDescription) {
        const description = await tx.positionDescription.create({
          data: { ...command.positionDescription, editedBy: userId, editedAt: new Date() },
        });
        await syncPositionDescriptionResponsibilityNodesInTx(tx, description);
        data.positionDescriptionId = description.id;
      }
      const position = await tx.position.update({ where: { id: command.id }, data });
      await snapshotHistory("Position", command.id, userId, tx);
      return position;
    });
    return serviceOk({ success: true, position: updated });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("岗位编码已存在", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return serviceError("岗位不存在", 404);
    }
    throw error;
  }
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

export async function updatePositionField(command: CrudUpdateFieldCommand) {
  return executeUpdateField(command, POSITION_CONFIG);
}

export async function deletePosition(command: CrudDeleteCommand) {
  return executeDelete(command, POSITION_CONFIG);
}
