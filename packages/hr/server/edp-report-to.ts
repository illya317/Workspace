import { matchesFkKeyword, type FkOption } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";

function currentEdpWhere<T extends Record<string, unknown>>(extra: T) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...extra,
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
  };
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

async function parentPositionNameFor(positionId: number | null) {
  if (!positionId) return "";
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: {
      positionDescription: { select: { reportTo: true } },
    },
  });
  return normalizeText(position?.positionDescription?.reportTo);
}

export async function searchEdpReportToOptions({
  keyword,
  positionId,
}: {
  keyword: string;
  positionId: number | null;
}): Promise<FkOption[]> {
  const parentPositionName = await parentPositionNameFor(positionId);
  if (!parentPositionName) return [];

  const parentPositions = await prisma.position.findMany({
    where: { name: parentPositionName, isArchived: false },
    select: { id: true },
  });
  const parentPositionIds = parentPositions.map((position) => position.id);
  if (parentPositionIds.length === 0) return [];

  const rows = await prisma.eDP.findMany({
    where: currentEdpWhere({
      positionId: { in: parentPositionIds },
      employee: { employments: { some: { isActive: true } } },
    }),
    select: {
      employee: { select: { id: true, name: true, employeeId: true } },
    },
    orderBy: [{ employee: { employeeId: "asc" } }, { id: "asc" }],
  });

  const seen = new Set<number>();
  return rows
    .map((row) => row.employee)
    .filter((employee) => {
      if (seen.has(employee.id)) return false;
      seen.add(employee.id);
      return true;
    })
    .map((employee) => ({
      id: employee.id,
      name: employee.name,
      subtitle: employee.employeeId,
      lifecycleStatus: "active" as const,
    }))
    .filter((option) => matchesFkKeyword([option.name, option.subtitle], keyword))
    .slice(0, 50);
}

export async function validateEdpReportTo({
  positionId,
  reportTo,
}: {
  positionId: number | null;
  reportTo: unknown;
}): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const value = normalizeText(reportTo);
  if (!value) return { ok: true, value: null };
  if (!positionId) return { ok: false, error: "请先选择岗位，再选择直接上级。" };

  const options = await searchEdpReportToOptions({ positionId, keyword: "" });
  if (options.some((option) => option.name === value || option.subtitle === value)) {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: "直接上级必须从该岗位对应上级岗位的在职任职人员中选择。",
  };
}
