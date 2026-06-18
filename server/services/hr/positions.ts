import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { matchAnyField } from "@/lib/search-schema";
import { snapshotHistory } from "@/lib/history";
import { loadCompanyMap, getCompanyNameSync } from "@/server/services/hr/company-directory";

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
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function getPositionList(
  keyword: string,
  page: number,
  pageSize: number
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

  let result = positions.map((p) => {
    let codeRaw: string | null = null;
    const positionDescriptionDetails = parsePositionDetails(p.positionDescription?.details || null);
    if (p.positionDescription?.details) {
      codeRaw = typeof positionDescriptionDetails?.code_raw === "string" ? positionDescriptionDetails.code_raw : null;
    }
    return {
      id: p.id,
      code: p.code,
      codeRaw,
      name: p.name,
      alias: p.alias || null,
      company: getCompanyNameSync(companyMap, p.code),
      departmentId: p.departmentId,
      departmentName: p.department?.name || null,
      positionDescriptionId: p.positionDescriptionId,
      positionDescriptionName: p.positionDescription?.name || null,
      positionDescriptionCode: p.positionDescription?.code || null,
      positionDescriptionDepartmentName: p.positionDescription?.departmentName || null,
      positionDescriptionDetails,
      reportTo: p.positionDescription?.reportTo || null,
      summary: p.positionDescription?.summary || null,
      positionPurpose: p.positionDescription?.positionPurpose || null,
      headcountPlan: p.positionDescription?.headcount || null,
      version: p.positionDescription?.version || null,
      effectiveDate: p.positionDescription?.effectiveDate || null,
      sourceFile: p.positionDescription?.sourceFile || null,
      headcount: p._count.edps,
    };
  });

  if (keyword) result = result.filter((p) => matchAnyField(p, keyword, "Position"));

  const total = result.length;
  const start = (page - 1) * pageSize;
  const paged = result.slice(start, start + pageSize);
  return { positions: paged, total };
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
  userId: number
) {
  const data: Prisma.PositionUncheckedUpdateInput = {};
  if (body.code !== undefined) data.code = body.code;
  if (body.name !== undefined) data.name = body.name;
  if (body.alias !== undefined) data.alias = body.alias || null;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId ? Number(body.departmentId) : null;
  if (body.positionDescriptionId !== undefined) data.positionDescriptionId = body.positionDescriptionId ? Number(body.positionDescriptionId) : null;
  data.editedBy = userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  const updated = await prisma.position.update({
    where: { id },
    data,
  });
  await snapshotHistory("Position", id, userId);
  return updated;
}

export async function deletePosition(id: number) {
  await prisma.position.delete({ where: { id } });
}
