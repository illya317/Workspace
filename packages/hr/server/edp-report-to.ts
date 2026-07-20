import { matchesFkKeyword, type FkOption } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { isFunctionalDepartmentCode } from "./domain/position-report-override-validation";

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

type ParentPositionCandidate = {
  id: number;
  departmentId: number | null;
  isFunctional: boolean;
};

function toParentPositionCandidate(position: {
  id: number;
  departmentId: number | null;
  department: { code: string | null } | null;
} | null | undefined): ParentPositionCandidate | null {
  if (!position) return null;
  return {
    id: position.id,
    departmentId: position.departmentId,
    isFunctional: isFunctionalDepartmentCode(position.department?.code),
  };
}

async function parentPositionFor(positionId: number | null): Promise<ParentPositionCandidate[]> {
  if (!positionId) return [];
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: {
      reportToPosition: { select: { id: true, departmentId: true, department: { select: { code: true } } } },
    },
  });
  const parent = toParentPositionCandidate(position?.reportToPosition);
  return parent ? [parent] : [];
}

async function parentOverridePositionFor({
  positionId,
  reportingCompanyId,
  departmentId,
  positionReportOverrideId,
}: {
  positionId: number | null;
  reportingCompanyId?: number | null;
  departmentId: number | null;
  positionReportOverrideId?: number | null;
}): Promise<ParentPositionCandidate[] | null> {
  if (!positionId) return null;
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { departmentId: true, department: { select: { code: true } } },
  });
  const isFunctional = isFunctionalDepartmentCode(position?.department?.code);
  const isOwnFunctionalDepartment = isFunctional
    && Boolean(departmentId)
    && Boolean(position?.departmentId)
    && departmentId === position?.departmentId;
  if (isOwnFunctionalDepartment && !positionReportOverrideId) {
    return null;
  }
  if (!departmentId || (!reportingCompanyId && !positionReportOverrideId)) {
    return isFunctional ? [] : null;
  }
  const override = await prisma.positionReportOverride.findFirst({
    where: {
      ...(positionReportOverrideId
        ? { id: positionReportOverrideId }
        : { companyId: reportingCompanyId ?? undefined }),
      positionId,
      departmentId,
      isActive: true,
    },
    select: {
      reportToPositionId: true,
      reportToPosition: { select: { id: true, departmentId: true, department: { select: { code: true } } } },
    },
  });
  if (!override?.reportToPositionId) {
    return isFunctional ? [] : null;
  }
  const parent = toParentPositionCandidate(override.reportToPosition);
  return parent ? [parent] : [];
}

export async function searchEdpReportToOptions({
  keyword,
  positionId,
  reportingCompanyId,
  departmentId,
  positionReportOverrideId,
}: {
  keyword: string;
  positionId: number | null;
  reportingCompanyId?: number | null;
  departmentId?: number | null;
  positionReportOverrideId?: number | null;
}): Promise<FkOption[]> {
  const overrideParent = await parentOverridePositionFor({
    positionId,
    reportingCompanyId,
    departmentId: departmentId ?? null,
    positionReportOverrideId,
  });
  let parentPositions = overrideParent ?? [];
  if (!overrideParent) {
    parentPositions = await parentPositionFor(positionId);
  }
  const parentPositionIds = parentPositions.map((position) => position.id);
  if (parentPositionIds.length === 0) return [];
  const parentById = new Map(parentPositions.map((position) => [position.id, position]));

  const rows = await prisma.eDP.findMany({
    where: currentEdpWhere({
      positionId: { in: parentPositionIds },
      employee: { employments: { some: { isActive: true } } },
    }),
    select: {
      employee: { select: { id: true, name: true, employeeId: true } },
      positionId: true,
      departmentId: true,
    },
    orderBy: [{ employee: { employeeId: "asc" } }, { id: "asc" }],
  });

  const seen = new Set<number>();
  return rows
    .filter((row) => {
      const parent = row.positionId ? parentById.get(row.positionId) : null;
      return !parent?.departmentId || parent.isFunctional || row.departmentId === parent.departmentId;
    })
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
  reportingCompanyId,
  departmentId,
  positionReportOverrideId,
  reportTo,
}: {
  positionId: number | null;
  reportingCompanyId?: number | null;
  departmentId?: number | null;
  positionReportOverrideId?: number | null;
  reportTo: unknown;
}): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const value = normalizeText(reportTo);
  if (!value) return { ok: true, value: null };
  if (!positionId) return { ok: false, error: "请先选择岗位，再选择直接上级。" };

  const options = await searchEdpReportToOptions({
    positionId,
    reportingCompanyId,
    departmentId,
    positionReportOverrideId,
    keyword: "",
  });
  if (options.some((option) => option.name === value || option.subtitle === value)) {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: "直接上级必须从该岗位对应上级岗位的在职任职人员中选择。",
  };
}
