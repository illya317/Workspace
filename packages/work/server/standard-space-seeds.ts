import {
  getOperatingCommitteeDepartmentContext,
} from "@workspace/platform/server/business-space-permissions";
import { prisma } from "@workspace/platform/server/prisma";

export type StandardOrganizationSpaceTargetType = "department";

export type StandardOrganizationSpaceSeed = {
  targetType: StandardOrganizationSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  lifecycleStatus: "active" | "archived";
  isOperatingCommittee: boolean;
};

export async function listStandardOrganizationSpaceSeeds(): Promise<StandardOrganizationSpaceSeed[]> {
  const [committee, departments] = await Promise.all([
    getOperatingCommitteeDepartmentContext(),
    prisma.department.findMany({
      where: { hierarchyKind: "M" },
      select: { id: true, name: true, code: true, isArchived: true },
      orderBy: [{ isArchived: "asc" }, { code: "asc" }, { id: "asc" }],
    }),
  ]);

  return dedupeStandardOrganizationSpaceSeeds([
    ...(committee ? [departmentSpaceSeed(committee, true)] : []),
    ...departments.map((department) => departmentSpaceSeed(department, false)),
  ]);
}

function departmentSpaceSeed(
  department: { id: number; name: string; code: string; isArchived: boolean },
  isOperatingCommittee: boolean,
): StandardOrganizationSpaceSeed {
  return {
    targetType: "department",
    targetId: department.id,
    name: department.name,
    subtitle: department.code,
    lifecycleStatus: department.isArchived ? "archived" : "active",
    isOperatingCommittee,
  };
}

function dedupeStandardOrganizationSpaceSeeds(seeds: StandardOrganizationSpaceSeed[]) {
  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = `${seed.targetType}:${seed.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
