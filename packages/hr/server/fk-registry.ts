import {
  createRelationCatalogFromRegistrations,
  defineRelationRegistrations,
  type RelationRegistrationAdapters,
} from "@workspace/platform/server/relation-targets";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import {
  archivedBooleanFilter,
  matchesFkKeyword,
  type FkOption,
  type LifecycleScope,
} from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { getManagerPositionScopeDepartmentIds } from "./department-manager-positions";
import { searchEdpReportToPositionOptions } from "./edp-report-to";
import { searchPositionsInOrganizationScope } from "./position-organization-scope";
import { validateActiveManagementDepartmentId } from "./domain/position-report-override-validation";

const HR_RELATION_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/hr").relationRegistrations ?? [];

const HR_RELATION_ADAPTERS: RelationRegistrationAdapters = {
  "hr.department.manager.position": {
    search: ({ keyword, lifecycleScope, params }) =>
      searchDepartmentManagerPositionOptions({
        keyword,
        lifecycleScope,
        departmentId: parseNullablePositiveId(params?.departmentId, "部门ID"),
      }),
  },
  "hr.edp.position": {
    search: ({ keyword, lifecycleScope, params }) =>
      searchEdpPositionOptions({
        keyword,
        lifecycleScope,
        reportingCompanyId: parseNullablePositiveId(params?.reportingCompanyId, "汇报公司ID"),
        departmentId: parseNullablePositiveId(params?.departmentId, "部门ID"),
      }),
  },
  "hr.position.inDepartment": {
    search: ({ keyword, lifecycleScope, params }) =>
      searchPositionInDepartmentOptions({
        keyword,
        lifecycleScope,
        departmentId: parseNullablePositiveId(params?.departmentId, "部门ID"),
      }),
  },
  "hr.edp.reportToPosition": {
    search: ({ keyword, lifecycleScope, params }) =>
      searchEdpReportToPositionOptions({
        keyword,
        lifecycleScope,
        positionId: parseNullablePositiveId(params?.positionId, "岗位ID"),
        departmentId: parseNullablePositiveId(params?.departmentId, "部门ID"),
      }),
  },
};

function parseNullablePositiveId(value: string | undefined, label: string) {
  if (!value) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label}无效`);
  return id;
}

async function searchDepartmentManagerPositionOptions(input: {
  keyword: string;
  lifecycleScope: LifecycleScope;
  departmentId: number | null;
}): Promise<FkOption[]> {
  if (!input.departmentId) return [];
  const departmentIds = await getManagerPositionScopeDepartmentIds(input.departmentId);
  if (departmentIds.length === 0) return [];
  const rankByDepartmentId = new Map(departmentIds.map((id, index) => [id, index]));
  const rows = await prisma.position.findMany({
    where: {
      departmentId: { in: departmentIds },
      ...archivedBooleanFilter(input.lifecycleScope),
      ...(input.lifecycleScope === "active" ? { department: { isArchived: false } } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      departmentId: true,
      isArchived: true,
      department: { select: { code: true, name: true } },
    },
    orderBy: input.lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: 200,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: [row.code, row.department?.name].filter(Boolean).join(" · "),
      departmentId: row.departmentId,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .sort((left, right) => (rankByDepartmentId.get(left.departmentId ?? 0) ?? 99) - (rankByDepartmentId.get(right.departmentId ?? 0) ?? 99) || left.id - right.id)
    .slice(0, 50);
}

async function searchEdpPositionOptions(input: {
  keyword: string;
  lifecycleScope: LifecycleScope;
  reportingCompanyId: number | null;
  departmentId: number | null;
}): Promise<FkOption[]> {
  if (!input.departmentId) return [];
  const targetDepartment = await validateActiveManagementDepartmentId(input.departmentId);
  if (!targetDepartment.ok) return [];
  const targetDepartmentName = targetDepartment.data.name;
  const [localPositions, reportOverrides] = await Promise.all([
    prisma.position.findMany({
      where: {
        departmentId: input.departmentId,
        ...archivedBooleanFilter(input.lifecycleScope),
        ...(input.lifecycleScope === "active" ? { department: { isArchived: false } } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        departmentId: true,
        isArchived: true,
      },
      orderBy: input.lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
      take: 200,
    }),
    input.reportingCompanyId
      ? prisma.positionReportOverride.findMany({
          where: {
            companyId: input.reportingCompanyId,
            departmentId: input.departmentId,
            isActive: true,
            position: {
              isArchived: false,
              department: {
                isArchived: false,
              },
            },
          },
          select: {
            position: {
              select: {
                id: true,
                code: true,
                name: true,
                departmentId: true,
                department: { select: { code: true, name: true } },
              },
            },
          },
          orderBy: [{ position: { code: "asc" } }, { id: "asc" }],
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const options: FkOption[] = [];
  const seen = new Set<number>();
  for (const position of localPositions) {
    if (seen.has(position.id)) continue;
    seen.add(position.id);
    options.push({
      id: position.id,
      name: position.name,
      subtitle: [position.code, targetDepartmentName].filter(Boolean).join(" · "),
      departmentId: position.departmentId,
      departmentPath: targetDepartmentName,
      lifecycleStatus: position.isArchived ? "archived" as const : "active" as const,
    });
  }
  for (const placement of reportOverrides) {
    const position = placement.position;
    if (seen.has(position.id)) continue;
    seen.add(position.id);
    options.push({
      id: position.id,
      name: position.name,
      subtitle: [position.code, "特殊适用", position.department?.name].filter(Boolean).join(" · "),
      departmentId: input.departmentId,
      departmentPath: targetDepartmentName,
      lifecycleStatus: "active" as const,
    });
  }
  return options
    .filter((row) => matchesFkKeyword([row.name, row.subtitle, row.departmentPath], input.keyword))
    .slice(0, 50);
}

async function searchPositionInDepartmentOptions(input: {
  keyword: string;
  lifecycleScope: LifecycleScope;
  departmentId: number | null;
}): Promise<FkOption[]> {
  return searchPositionsInOrganizationScope(input);
}

export const HR_FK_DEFINITIONS = defineRelationRegistrations(HR_RELATION_REGISTRATIONS, HR_RELATION_ADAPTERS);
export const HR_FK_REGISTRY = createRelationCatalogFromRegistrations(HR_RELATION_REGISTRATIONS, HR_RELATION_ADAPTERS);
