import { Prisma } from "@workspace/platform/server/prisma";
import { handleDelete, handleUpdateField } from "./hr-crud";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { getCompanyNameSync, loadCompanyMap } from "./company-directory";
import {
  buildPositionCreateCommand,
  buildPositionUpdateCommand,
  POSITION_ALLOWED_FIELDS,
  validatePositionDelete,
  validatePositionFieldUpdate,
  type PositionInput,
} from "./domain/position-validation";

export interface PositionListItem {
  id: number;
  code: string;
  codeRaw: string | null;
  name: string;
  alias: string | null;
  company: string;
  departmentId: number | null;
  departmentName: string | null;
  positionDescriptionId: number | null;
  positionDescriptionName: string | null;
  positionDescriptionCode: string | null;
  positionDescriptionDepartmentName: string | null;
  positionDescriptionDetails: Record<string, unknown> | null;
  reportTo: string | null;
  summary: string | null;
  positionPurpose: string | null;
  headcountPlan: number | null;
  version: number;
  positionDescriptionVersion: string | null;
  effectiveDate: string | null;
  sourceFile: string | null;
  headcount: number;
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

export async function getPositionList(
  keyword: string,
  page: number,
  pageSize: number,
  archived = false,
): Promise<{ positions: PositionListItem[]; total: number }> {
  const [positions, companyMap] = await Promise.all([
    prisma.position.findMany({
      where: { isArchived: archived },
      include: {
        _count: { select: { edps: true } },
        department: { select: { id: true, name: true } },
        positionDescription: {
          select: {
            id: true,
            code: true,
            name: true,
            departmentName: true,
            reportTo: true,
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
    const positionDescriptionDetails = parsePositionDetails(position.positionDescription?.details || null);
    if (position.positionDescription?.details) {
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
      departmentName: position.department?.name || null,
      positionDescriptionId: position.positionDescriptionId,
      positionDescriptionName: position.positionDescription?.name || null,
      positionDescriptionCode: position.positionDescription?.code || null,
      positionDescriptionDepartmentName: position.positionDescription?.departmentName || null,
      positionDescriptionDetails,
      reportTo: position.positionDescription?.reportTo || null,
      summary: position.positionDescription?.summary || null,
      positionPurpose: position.positionDescription?.positionPurpose || null,
      headcountPlan: position.positionDescription?.headcount || null,
      version: position.version,
      positionDescriptionVersion: position.positionDescription?.version || null,
      effectiveDate: position.positionDescription?.effectiveDate || null,
      sourceFile: position.positionDescription?.sourceFile || null,
      headcount: position._count.edps,
      isArchived: position.isArchived,
      archivedAt: position.archivedAt?.toISOString() || null,
    };
  });

  if (keyword) result = result.filter((position) => matchAnyField(position, keyword, "Position"));

  const total = result.length;
  const start = (page - 1) * pageSize;
  return { positions: result.slice(start, start + pageSize), total };
}

export async function createPosition(
  input: PositionInput,
  userId: number,
): Promise<DomainServiceResult<{ success: true; record: { id: number } }>> {
  const command = mapValidationToServiceResult(await buildPositionCreateCommand(input));
  if (!command.ok) return command;
  try {
    const record = await prisma.position.create({
      data: { ...command.data, editedBy: userId },
      select: { id: true },
    });
    await snapshotHistory("Position", record.id, userId);
    return { ok: true, data: { success: true, record } };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "编码已存在", status: 409 };
    }
    throw error;
  }
}

export async function updatePosition(
  id: number,
  body: {
    code?: string;
    name?: string;
    alias?: string | null;
    departmentId?: number | string | null;
    positionDescriptionId?: number | string | null;
    isArchived?: boolean;
    archivedAt?: Date | string | null;
  },
  userId: number,
): Promise<DomainServiceResult<{ success: true; position: unknown }>> {
  const command = mapValidationToServiceResult(await buildPositionUpdateCommand(id, body));
  if (!command.ok) return command;
  const data = command.data;
  data.editedBy = userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  try {
    const updated = await prisma.position.update({ where: { id }, data });
    await snapshotHistory("Position", id, userId);
    return { ok: true, data: { success: true, position: updated } };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "编码已存在", status: 409 };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, error: "岗位不存在", status: 404 };
    }
    throw error;
  }
}

export async function updatePositionField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, POSITION_CONFIG);
}

export async function deletePositionByParams(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, POSITION_CONFIG);
}
