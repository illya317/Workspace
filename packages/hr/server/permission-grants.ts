import {
  getGrants,
  getResourceSummariesByIds,
  setGrant,
  type SubjectType,
} from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";

type GrantSubjectType = Extract<SubjectType, "department" | "position">;

type ListSubjectPermissionGrantsInput = {
  subjectType: GrantSubjectType;
  isSystemAdmin: boolean;
  manageableResourceKeys: Iterable<string>;
};

type SetSubjectPermissionGrantInput = {
  subjectType: GrantSubjectType;
  subjectId: number;
  resourceKey: string;
  roleKey: string;
  value: boolean;
  actorUserId: number;
};

export async function listSubjectPermissionGrants(input: ListSubjectPermissionGrantsInput) {
  const manageableKeys = new Set(input.manageableResourceKeys);
  const grants = await getGrants(input.subjectType);
  const filteredGrants = input.isSystemAdmin
    ? grants
    : grants.filter((grant) => manageableKeys.has(grant.resourceKey));

  const resourceIds = [...new Set(filteredGrants.map((grant) => grant.resourceId))];
  const subjectIds = [...new Set(filteredGrants.map((grant) => grant.subjectId))];

  const [resources, subjects] = await Promise.all([
    getResourceSummariesByIds(resourceIds),
    input.subjectType === "department"
      ? prisma.department.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, code: true, name: true },
        })
      : prisma.position.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, code: true, name: true },
        }),
  ]);

  const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));

  return {
    grants: filteredGrants.map((grant) => ({
      ...grant,
      resource: resourceMap.get(grant.resourceId),
      [input.subjectType]: subjectMap.get(grant.subjectId),
      role: { key: grant.roleKey },
    })),
  };
}

export async function setSubjectPermissionGrant(input: SetSubjectPermissionGrantInput) {
  await setGrant(input.subjectType, input.subjectId, input.resourceKey, input.roleKey, input.value, {
    actorUserId: input.actorUserId,
  });
  return { success: true };
}
