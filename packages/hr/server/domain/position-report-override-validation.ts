import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { validatePositionInOrganizationScope } from "../position-organization-scope";

export const FUNCTIONAL_DEPARTMENT_CODE_PREFIX = "FUN";

export interface PositionReportOverrideInput {
  companyId: number;
  departmentId: number;
  reportToPositionId?: number | null;
  headcount?: number | null;
  isActive?: boolean | null;
}

export interface PositionReportOverrideCommandRow {
  companyId: number;
  departmentId: number;
  reportToPositionId: number | null;
  headcount: number | null;
  isActive: boolean;
}

export interface PositionReportOverrideSaveCommand {
  positionId: number;
  overrides: PositionReportOverrideCommandRow[];
  deleteIds: number[];
}

export interface EdpPositionAssignment {
  departmentId: number | null;
  reportingCompanyId: number | null;
  positionReportOverrideId: number | null;
  isFunctionalPosition: boolean;
}

type AssignmentInput = {
  positionId: number;
  reportingCompanyId?: number | null;
  departmentId?: number | null;
  positionReportOverrideId?: number | null;
};

export function isFunctionalDepartmentCode(code: string | null | undefined) {
  return Boolean(code?.toUpperCase().startsWith(FUNCTIONAL_DEPARTMENT_CODE_PREFIX));
}

export function isFunctionalPosition(position: {
  isArchived: boolean;
  department: { code: string | null; hierarchyKind?: string; isArchived: boolean } | null;
}) {
  return !position.isArchived
    && Boolean(position.department)
    && isFunctionalDepartmentCode(position.department?.code)
    && !position.department?.isArchived;
}

export async function validateActiveCompanyId(companyId: number) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, isActive: true },
  });
  if (!company) return failCommand("适用公司不存在", 404);
  if (!company.isActive) return failCommand("停用公司不能作为适用公司");
  return okCommand(company.id);
}

export async function validateActiveManagementDepartmentId(departmentId: number) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      code: true,
      name: true,
      hierarchyKind: true,
      isArchived: true,
      parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
    },
  });
  if (!department) return failCommand("适用组织不存在", 404);
  if (department.isArchived) return failCommand("归档组织不能作为适用组织");
  return okCommand(department);
}

export async function validateReportOverrideSourcePosition(positionId: number, options: { strict: boolean }) {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      departmentId: true,
      department: { select: { id: true, code: true, name: true, hierarchyKind: true, isArchived: true } },
    },
  });
  if (!position) return failCommand("岗位不存在", 404);
  const functional = isFunctionalPosition(position);
  if (options.strict && position.isArchived) return failCommand("归档岗位不能维护特殊汇报");
  return okCommand({ position, functional });
}

async function validatePlacementInput(
  positionId: number,
  placement: PositionReportOverrideInput,
): Promise<DomainValidationResult<PositionReportOverrideCommandRow>> {
  if (!Number.isInteger(placement.companyId) || placement.companyId <= 0) {
    return failCommand("适用公司无效");
  }
  const company = await validateActiveCompanyId(placement.companyId);
  if (!company.ok) return company;
  if (!Number.isInteger(placement.departmentId) || placement.departmentId <= 0) {
    return failCommand("适用部门无效");
  }
  const department = await validateActiveManagementDepartmentId(placement.departmentId);
  if (!department.ok) return department;
  if (placement.reportToPositionId !== null && placement.reportToPositionId !== undefined) {
    if (!Number.isInteger(placement.reportToPositionId) || placement.reportToPositionId <= 0) {
      return failCommand("上级岗位无效");
    }
    const reportToPosition = await validatePositionInOrganizationScope({
      positionId: placement.reportToPositionId,
      departmentId: placement.departmentId,
      label: "上级岗位",
      scopeLabel: "适用组织",
      excludePositionId: positionId,
    });
    if (!reportToPosition.ok) return reportToPosition;
  }
  if (placement.headcount !== null && placement.headcount !== undefined) {
    if (!Number.isInteger(placement.headcount) || placement.headcount < 0) {
      return failCommand("编制必须是非负整数");
    }
  }
  return okCommand({
    companyId: placement.companyId,
    departmentId: placement.departmentId,
    reportToPositionId: placement.reportToPositionId ?? null,
    headcount: placement.headcount ?? null,
    isActive: placement.isActive ?? true,
  });
}

export async function buildPositionReportOverrideSaveCommand(input: {
  positionId: number;
  overrides: PositionReportOverrideInput[];
}): Promise<DomainValidationResult<PositionReportOverrideSaveCommand>> {
  const source = await validateReportOverrideSourcePosition(input.positionId, { strict: true });
  if (!source.ok) return source;

  const seen = new Set<string>();
  const overrides: PositionReportOverrideCommandRow[] = [];
  for (const override of input.overrides) {
    const key = `${override.companyId}:${override.departmentId}`;
    if (seen.has(key)) return failCommand("同一岗位不能重复添加同一适用公司和适用部门", 409);
    seen.add(key);
    const validation = await validatePlacementInput(input.positionId, override);
    if (!validation.ok) return validation;
    overrides.push(validation.data);
  }

  const nextKeys = new Set(overrides.map((override) => `${override.companyId}:${override.departmentId}`));
  const existing = await prisma.positionReportOverride.findMany({
    where: { positionId: input.positionId },
    select: { id: true, companyId: true, departmentId: true, _count: { select: { edps: true } } },
  });
  const protectedPlacements = existing.filter((placement) => !nextKeys.has(`${placement.companyId}:${placement.departmentId}`) && placement._count.edps > 0);
  if (protectedPlacements.length > 0) {
    return failCommand("已有员工任职引用的适用配置不能删除，请先调整员工任职", 409);
  }

  return okCommand({
    positionId: input.positionId,
    overrides,
    deleteIds: existing
      .filter((placement) => !nextKeys.has(`${placement.companyId}:${placement.departmentId}`))
      .map((placement) => placement.id),
  });
}

export async function resolveEdpPositionAssignment(input: AssignmentInput): Promise<DomainValidationResult<EdpPositionAssignment>> {
  if (input.reportingCompanyId !== null && input.reportingCompanyId !== undefined) {
    const company = await validateActiveCompanyId(input.reportingCompanyId);
    if (!company.ok) return company;
  }

  const position = await prisma.position.findUnique({
    where: { id: input.positionId },
    select: {
      id: true,
      departmentId: true,
      isArchived: true,
      department: { select: { id: true, code: true, hierarchyKind: true, isArchived: true } },
    },
  });
  if (!position) return failCommand("岗位不存在", 404);
  if (position.isArchived) return failCommand("岗位已归档或不再现用，不能选择");

  const activeOverride = input.departmentId && input.reportingCompanyId
    ? await prisma.positionReportOverride.findFirst({
        where: {
          ...(input.positionReportOverrideId ? { id: input.positionReportOverrideId } : {}),
          positionId: input.positionId,
          companyId: input.reportingCompanyId,
          departmentId: input.departmentId,
          isActive: true,
        },
        select: { id: true, companyId: true, departmentId: true },
      })
    : null;
  if (input.positionReportOverrideId && !activeOverride) return failCommand("特殊汇报配置无效");

  if (activeOverride) {
    return okCommand({
      departmentId: activeOverride.departmentId,
      reportingCompanyId: activeOverride.companyId,
      positionReportOverrideId: activeOverride.id,
      isFunctionalPosition: isFunctionalPosition(position),
    });
  }

  if (input.departmentId && position.departmentId && input.departmentId === position.departmentId) {
    return okCommand({
      departmentId: position.departmentId,
      reportingCompanyId: input.reportingCompanyId ?? null,
      positionReportOverrideId: null,
      isFunctionalPosition: isFunctionalPosition(position),
    });
  }

  if (!isFunctionalPosition(position)) {
    if (input.departmentId && position.departmentId && input.departmentId !== position.departmentId) {
      return failCommand("普通岗位只能选择其所属部门");
    }
    return okCommand({
      departmentId: position.departmentId ?? input.departmentId ?? null,
      reportingCompanyId: input.reportingCompanyId ?? null,
      positionReportOverrideId: null,
      isFunctionalPosition: false,
    });
  }

  if (!input.departmentId) return failCommand("选择 FUN 岗位前请先选择实际部门");
  if (!input.reportingCompanyId) return failCommand("选择 FUN 岗位前请先选择汇报公司");
  const department = await validateActiveManagementDepartmentId(input.departmentId);
  if (!department.ok) return department;

  return failCommand("该岗位未对所选公司和部门启用");
}
