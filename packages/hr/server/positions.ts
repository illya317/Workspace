import { Prisma } from "@workspace/platform/server/prisma";
import { handleCreate, handleDelete, handleUpdateField } from "./hr-crud";
import { parseJson } from "@workspace/platform/server/api";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { PositionCreateSchema } from "./schemas";
import { getCompanyNameSync, loadCompanyMap } from "./company-directory";
import { HR_FK_REGISTRY } from "./fk-registry";
import { guardPositionArchive } from "./reference-guards";

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
  version: string | null;
  effectiveDate: string | null;
  sourceFile: string | null;
  headcount: number;
  isArchived: boolean;
  archivedAt: string | null;
}

const POSITION_CONFIG = {
  entityType: "Position",
  modelKey: "position" as const,
  allowedFields: ["code", "name", "alias", "departmentId", "positionDescriptionId", "isArchived", "archivedAt"],
  onBeforeUpdate: normalizePositionFieldUpdate,
  onBeforeDelete: async (id: number) => {
    const blockMessage = await guardPositionArchive(id, "删除岗位");
    return blockMessage ? { error: blockMessage, status: 409 } : { ok: true as const };
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
      version: position.positionDescription?.version || null,
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

export async function createPosition(request: Request) {
  const parsed = await parseJson(request, PositionCreateSchema);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const departmentValidation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.position.department",
    value: parsed.data.departmentId,
    requiredLabel: "所属部门",
  });
  if (!departmentValidation.ok) return { ok: false as const, error: departmentValidation.error };
  const descriptionValidation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.positionDescription",
    value: parsed.data.positionDescriptionId,
    requiredLabel: "岗位说明书",
  });
  if (!descriptionValidation.ok) return { ok: false as const, error: descriptionValidation.error };
  return {
    ok: true as const,
    response: await handleCreate(request, { entityType: "Position", modelKey: "position" as const }, () => ({
      ...parsed.data,
      departmentId: departmentValidation.value,
      positionDescriptionId: descriptionValidation.value,
    })),
  };
}

async function normalizePositionFieldUpdate(field: string, value: unknown, id?: number) {
  if (field === "departmentId") {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "hr.position.department",
      value,
      requiredLabel: "所属部门",
    });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  if (field === "positionDescriptionId") {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "hr.positionDescription",
      value,
      requiredLabel: "岗位说明书",
    });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  if (field === "isArchived") {
    const archived = Boolean(value);
    if (archived && id) {
      const blockMessage = await guardPositionArchive(id);
      if (blockMessage) return { error: blockMessage, status: 409 };
    }
    return { field, value: archived };
  }
  return { field, value };
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
) {
  const data: Prisma.PositionUncheckedUpdateInput = {};
  if (body.code !== undefined) data.code = body.code;
  if (body.name !== undefined) data.name = body.name;
  if (body.alias !== undefined) data.alias = body.alias || null;
  if (body.departmentId !== undefined) {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "hr.position.department",
      value: body.departmentId,
      requiredLabel: "所属部门",
    });
    if (!validation.ok) throw new Error(validation.error);
    data.departmentId = validation.value;
  }
  if (body.positionDescriptionId !== undefined) {
    const validation = await validateFkValue(HR_FK_REGISTRY, {
      fkKey: "hr.positionDescription",
      value: body.positionDescriptionId,
      requiredLabel: "岗位说明书",
    });
    if (!validation.ok) throw new Error(validation.error);
    data.positionDescriptionId = validation.value;
  }
  if (body.isArchived !== undefined) {
    const archived = Boolean(body.isArchived);
    if (archived) {
      const blockMessage = await guardPositionArchive(id);
      if (blockMessage) throw new Error(blockMessage);
    }
    data.isArchived = archived;
    data.archivedAt = archived ? new Date() : null;
  }
  data.editedBy = userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  const updated = await prisma.position.update({ where: { id }, data });
  await snapshotHistory("Position", id, userId);
  return updated;
}

export async function deletePosition(id: number) {
  const blockMessage = await guardPositionArchive(id, "删除岗位");
  if (blockMessage) throw new Error(blockMessage);
  await prisma.position.delete({ where: { id } });
}

export async function updatePositionField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, POSITION_CONFIG);
}

export async function deletePositionByParams(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, POSITION_CONFIG);
}
