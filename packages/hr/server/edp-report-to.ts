import {
  effectiveDateIntervalWhere,
  employmentDateWhereAt,
  type FkOption,
  type LifecycleScope,
} from "@workspace/platform/server/relation-registry";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { prisma } from "@workspace/platform/server/prisma";
import { isFunctionalDepartmentCode } from "./domain/position-report-override-validation";
import {
  searchPositionsInOrganizationScope,
  validatePositionInOrganizationScope,
} from "./position-organization-scope";
import { getBusinessCodeConfig } from "@workspace/platform/server/system-config";

export type EdpReportingPlacement = {
  positionId: number | null;
  reportingCompanyId?: number | null;
  departmentId?: number | null;
  positionReportOverrideId?: number | null;
};

type ParentPositionCandidate = {
  id: number;
  departmentId: number | null;
  isFunctional: boolean;
};

function toParentPositionCandidate(position: {
  id: number;
  departmentId: number | null;
  department: { code: string | null } | null;
} | null | undefined, functionalPrefix: string): ParentPositionCandidate | null {
  if (!position) return null;
  return {
    id: position.id,
    departmentId: position.departmentId,
    isFunctional: isFunctionalDepartmentCode(position.department?.code, functionalPrefix),
  };
}

async function parentPositionFor(positionId: number | null, functionalPrefix: string) {
  if (!positionId) return null;
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: {
      reportToPosition: { select: { id: true, departmentId: true, department: { select: { code: true } } } },
    },
  });
  return toParentPositionCandidate(position?.reportToPosition, functionalPrefix);
}

async function parentOverridePositionFor({
  positionId,
  reportingCompanyId,
  departmentId,
  positionReportOverrideId,
}: EdpReportingPlacement, functionalPrefix: string): Promise<ParentPositionCandidate | null | undefined> {
  if (!positionId) return null;
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { departmentId: true, department: { select: { code: true } } },
  });
  const isFunctional = isFunctionalDepartmentCode(position?.department?.code, functionalPrefix);
  const isOwnFunctionalDepartment = isFunctional
    && Boolean(departmentId)
    && Boolean(position?.departmentId)
    && departmentId === position?.departmentId;
  if (isOwnFunctionalDepartment && !positionReportOverrideId) return undefined;
  if (!departmentId || (!reportingCompanyId && !positionReportOverrideId)) {
    return isFunctional ? null : undefined;
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
  if (!override?.reportToPositionId) return isFunctional ? null : undefined;
  return toParentPositionCandidate(override.reportToPosition, functionalPrefix);
}

/** Resolves the structural reporting position applied to a new assignment period. */
export async function resolveDefaultEdpReportToPositionId(placement: EdpReportingPlacement) {
  const functionalPrefix = (await getBusinessCodeConfig()).department.functionalPrefix;
  const overrideParent = await parentOverridePositionFor(placement, functionalPrefix);
  const parent = overrideParent === undefined
    ? await parentPositionFor(placement.positionId, functionalPrefix)
    : overrideParent;
  return parent?.id ?? null;
}

/** Validates an explicit assignment-period reporting position against the organization hierarchy. */
export async function validateEdpReportToPosition({
  positionId,
  departmentId,
  reportToPositionId,
}: {
  positionId: number | null;
  departmentId: number | null;
  reportToPositionId: unknown;
}): Promise<DomainValidationResult<number | null>> {
  if (reportToPositionId === null || reportToPositionId === undefined || reportToPositionId === "") {
    return okCommand(null);
  }
  const parsed = Number(reportToPositionId);
  if (!Number.isInteger(parsed) || parsed <= 0) return failCommand("汇报岗位无效", 400, "reportToPositionId");
  return validatePositionInOrganizationScope({
    positionId: parsed,
    departmentId,
    label: "汇报岗位",
    scopeLabel: "任职组织",
    excludePositionId: positionId,
  });
}

export async function searchEdpReportToPositionOptions({
  keyword,
  lifecycleScope,
  positionId,
  departmentId,
}: {
  keyword: string;
  lifecycleScope: LifecycleScope;
  positionId: number | null;
  departmentId: number | null;
}): Promise<FkOption[]> {
  const options = await searchPositionsInOrganizationScope({ keyword, lifecycleScope, departmentId });
  return options.filter((option) => option.id !== positionId);
}

/** Derives people from reporting positions at a date; the position relation remains the fact. */
export async function listEmployeesInReportToPositions({
  positionIds,
  asOfDate = workspaceBusinessDate(new Date()),
}: {
  positionIds: number[];
  asOfDate?: string;
}) {
  const ids = Array.from(new Set(positionIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return [];
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)
    ? asOfDate
    : workspaceBusinessDate(new Date());
  return prisma.employee.findMany({
    where: {
      employments: { some: employmentDateWhereAt({}, effectiveDate) },
      positions: {
        some: effectiveDateIntervalWhere({ positionId: { in: ids } }, "startDate", "endDate", effectiveDate),
      },
    },
    select: { id: true, employeeId: true, name: true, userId: true },
    orderBy: { employeeId: "asc" },
  });
}
