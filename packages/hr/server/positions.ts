import { Prisma } from "@workspace/platform/server/prisma";
import { handleCreate, handleDelete, handleUpdateField } from "./crud";
import { parseJson } from "@workspace/platform/server/api";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "./search";
import { PositionCreateSchema } from "./schemas";
import { getCompanyNameSync, loadCompanyMap } from "./company-directory";

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

export async function getPositionList(
  keyword: string,
  page: number,
  pageSize: number,
): Promise<{ positions: PositionListItem[]; total: number }> {
  const [positions, companyMap] = await Promise.all([
    prisma.position.findMany({
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
      orderBy: { id: "asc" },
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
  return { ok: true as const, response: await handleCreate(request, { entityType: "Position", modelKey: "position" as const }, () => parsed.data) };
}

export async function updatePosition(
  id: number,
  body: {
    code?: string;
    name?: string;
    alias?: string | null;
    departmentId?: number | string | null;
    positionDescriptionId?: number | string | null;
  },
  userId: number,
) {
  const data: Prisma.PositionUncheckedUpdateInput = {};
  if (body.code !== undefined) data.code = body.code;
  if (body.name !== undefined) data.name = body.name;
  if (body.alias !== undefined) data.alias = body.alias || null;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId ? Number(body.departmentId) : null;
  if (body.positionDescriptionId !== undefined) {
    data.positionDescriptionId = body.positionDescriptionId ? Number(body.positionDescriptionId) : null;
  }
  data.editedBy = userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  const updated = await prisma.position.update({ where: { id }, data });
  await snapshotHistory("Position", id, userId);
  return updated;
}

export async function deletePosition(id: number) {
  await prisma.position.delete({ where: { id } });
}

export async function updatePositionField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, {
    entityType: "Position",
    modelKey: "position" as const,
    allowedFields: ["code", "name", "alias", "departmentId", "positionDescriptionId"],
  });
}

export async function deletePositionByParams(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, {
    entityType: "Position",
    modelKey: "position" as const,
    allowedFields: ["code", "name", "alias", "departmentId", "positionDescriptionId"],
  });
}
