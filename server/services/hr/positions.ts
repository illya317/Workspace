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
  headcount: number;
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
        positionDescription: { select: { id: true, name: true, details: true } },
      },
      orderBy: { id: "asc" },
    }),
    loadCompanyMap(),
  ]);

  let result = positions.map((p) => {
    let codeRaw: string | null = null;
    if (p.positionDescription?.details) {
      try {
        const details = JSON.parse(p.positionDescription.details);
        codeRaw = details.code_raw || null;
      } catch {}
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
  body: { code?: string; name?: string; alias?: string | null },
  userId: number
) {
  const data: Prisma.PositionUpdateInput = {};
  if (body.code !== undefined) data.code = body.code;
  if (body.name !== undefined) data.name = body.name;
  if (body.alias !== undefined) data.alias = body.alias || null;
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
