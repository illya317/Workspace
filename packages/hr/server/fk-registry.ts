import {
  createFkRegistryFromRegistrations,
  defineFkRegistrations,
  type FkRegistrationAdapters,
  type FkRegistration,
} from "@workspace/platform/server/fk-targets";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import {
  archivedBooleanFilter,
  matchesFkKeyword,
  type FkOption,
  type LifecycleScope,
} from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { getManagerPositionScopeDepartmentIds } from "./department-manager-positions";
import { searchEdpReportToOptions } from "./edp-report-to";

const HR_FK_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/hr").fkRegistrations as FkRegistration[];

const HR_FK_ADAPTERS: FkRegistrationAdapters = {
  "hr.department.manager.position": {
    search: ({ keyword, lifecycleScope, params }) =>
      searchDepartmentManagerPositionOptions({
        keyword,
        lifecycleScope,
        departmentId: parseNullablePositiveId(params?.departmentId, "部门ID"),
      }),
  },
  "hr.edp.reportTo": {
    search: ({ keyword, params }) =>
      searchEdpReportToOptions({
        keyword,
        positionId: parseNullablePositiveId(params?.positionId, "岗位ID"),
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

export const HR_FK_DEFINITIONS = defineFkRegistrations(HR_FK_REGISTRATIONS, HR_FK_ADAPTERS);
export const HR_FK_REGISTRY = createFkRegistryFromRegistrations(HR_FK_REGISTRATIONS, HR_FK_ADAPTERS);
