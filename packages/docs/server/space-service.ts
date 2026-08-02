import "server-only";

import { getSpaceChildResourceKeyForTargetType } from "@workspace/platform/permission-resource-policy";
import { prisma } from "@workspace/platform/server/prisma";
import { getOperatingCommitteeDepartmentContext } from "@workspace/platform/server/business-space-permissions";
import {
  docsEditorDb,
  type DocsEditorDb,
  type DocsEditorSpaceRow,
} from "./db";
import {
  canPublishOfficialQcTemplate,
  docsEditorActionPermissionsForSpace,
  getAllDepartmentContexts,
  getDepartmentContext,
  getGroupCompanyContext,
  getUserDepartmentContexts,
} from "./permissions";
import { ensureOfficialTemplates } from "./official-template-sync";
import type {
  DocsEditorSpaceActionPermissions,
  DocsEditorSpaceDto,
} from "./types";
import { resolveDocsEditorActionRuntime } from "./action-runtime";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

type DocsEditorSpaceTargetType = DocsEditorSpaceDto["targetType"];

type SpaceSeed = {
  targetType: DocsEditorSpaceTargetType;
  targetId: number;
  title: string;
  description: string;
};

export type DocsEditorAccessibleSpace = {
  space: DocsEditorSpaceRow;
  actionPermissions: DocsEditorSpaceActionPermissions;
};

export async function toSpaceDto(
  userId: number,
  space: DocsEditorSpaceRow,
  actionPermissions?: DocsEditorSpaceActionPermissions,
): Promise<DocsEditorSpaceDto> {
  const targetType = normalizeSpaceTargetType(space.targetType);
  const permissions = actionPermissions ?? await docsEditorActionPermissionsForSpace(userId, space);
  const [createRuntime, saveRuntime, publishRuntime] = await Promise.all([
    resolveDocsEditorActionRuntime({ userId, space, permissions, action: "create" }),
    resolveDocsEditorActionRuntime({ userId, space, permissions, action: "save" }),
    resolveDocsEditorActionRuntime({ userId, space, permissions, action: "publish" }),
  ]);
  const committee = getTenantProfile().organization.operatingCommittee;
  const committeeDescription = `${committee.departmentName}成员可查看，${committee.executivePositionNames.join("、")}可管理`;
  return {
    id: String(space.id),
    kind: targetType,
    targetType,
    targetId: space.targetId,
    title: targetType === "company" ? "公司模板" : targetType === "committee" ? `${committee.departmentName}模板` : space.title,
    ...(targetType === "company"
      ? { description: "所有人可查看的公司文档模板空间" }
      : targetType === "committee"
        ? { description: committeeDescription }
      : space.description ? { description: space.description } : {}),
    departmentId: targetType === "department" ? space.targetId : null,
    actionPermissions: permissions,
    actionRuntimes: { create: createRuntime, save: saveRuntime, publish: publishRuntime },
  };
}

export async function ensureDocsEditorSpaceForTarget(
  targetTypeInput: string,
  targetId: number,
  db: DocsEditorDb = docsEditorDb(),
) {
  const targetType = normalizeSpaceTargetType(targetTypeInput);
  if (targetType === "personal") return ensurePersonalSpace(targetId, db);
  if (targetType === "company") return ensureCompanySpace(db);
  if (targetType === "committee") return ensureCommitteeSpace(db);
  return ensureDepartmentSpace(targetId, db);
}

export async function listAccessibleSpaces(userId: number): Promise<DocsEditorAccessibleSpace[]> {
  const db = docsEditorDb();
  await ensureOfficialTemplates(db);
  const isAdmin = await canPublishOfficialQcTemplate(userId);
  const departments = isAdmin ? await getAllDepartmentContexts() : await getUserDepartmentContexts(userId);
  const personal = await ensurePersonalSpace(userId, db);
  const [companySpace, committeeSpace, explicitSeeds] = await Promise.all([
    ensureCompanySpace(db),
    ensureCommitteeSpace(db),
    listExplicitSpaceSeeds(userId),
  ]);
  const departmentSpaces = await Promise.all(
    departments.map((department) => ensureDepartmentSpace(department.id, db)),
  );
  const explicitSpaces = await Promise.all(explicitSeeds.map((seed) => ensureSpace(seed, db)));
  const baseSpaces = [
    personal,
    ...(companySpace ? [companySpace] : []),
    ...(committeeSpace ? [committeeSpace] : []),
    ...departmentSpaces.filter((space): space is DocsEditorSpaceRow => Boolean(space)),
    ...explicitSpaces,
  ];
  const uniqueSpaces = new Map<number, DocsEditorSpaceRow>();
  baseSpaces.forEach((space) => uniqueSpaces.set(space.id, space));

  const result: DocsEditorAccessibleSpace[] = [];
  for (const space of Array.from(uniqueSpaces.values())) {
    const actionPermissions = await docsEditorActionPermissionsForSpace(userId, space);
    if (hasAnySpaceAction(actionPermissions)) result.push({ space, actionPermissions });
  }
  return result;
}

export async function resolveTargetSpace(command: {
  userId: number;
  spaceId?: number;
  departmentId?: number;
  spaceKind?: string;
}, db: DocsEditorDb) {
  if (command.spaceId) {
    return db.documentTemplateSpace.findFirst({ where: { id: command.spaceId, deletedAt: null } });
  }
  if (command.departmentId || command.spaceKind === "department") {
    if (!command.departmentId) return null;
    return ensureDepartmentSpace(command.departmentId, db);
  }
  if (command.spaceKind === "company") return ensureCompanySpace(db);
  if (command.spaceKind === "committee") return ensureCommitteeSpace(db);
  return ensurePersonalSpace(command.userId, db);
}

function normalizeSpaceTargetType(value: string): DocsEditorSpaceTargetType {
  if (value === "personal" || value === "company" || value === "committee" || value === "department") return value;
  return "department";
}

async function ensureSpace(seed: SpaceSeed, db: DocsEditorDb = docsEditorDb()) {
  const existing = await db.documentTemplateSpace.findFirst({
    where: { targetType: seed.targetType, targetId: seed.targetId, deletedAt: null },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;
  return db.documentTemplateSpace.create({
    data: {
      targetType: seed.targetType,
      targetId: seed.targetId,
      title: seed.title,
      description: seed.description,
    },
  });
}

function ensurePersonalSpace(userId: number, db: DocsEditorDb = docsEditorDb()) {
  return ensureSpace({
    targetType: "personal",
    targetId: userId,
    title: "我的模板空间",
    description: "个人草稿和私有模板",
  }, db);
}

async function ensureCompanySpace(db: DocsEditorDb = docsEditorDb()) {
  const company = await getGroupCompanyContext();
  if (!company) return null;
  return ensureSpace({
    targetType: "company",
    targetId: company.id,
    title: "公司模板",
    description: "所有人可查看的公司文档模板空间",
  }, db);
}

async function ensureCommitteeSpace(db: DocsEditorDb = docsEditorDb()) {
  const committee = await getOperatingCommitteeDepartmentContext();
  if (!committee) return null;
  const committeeProfile = getTenantProfile().organization.operatingCommittee;
  return ensureSpace({
    targetType: "committee",
    targetId: committee.id,
    title: `${committeeProfile.departmentName}模板`,
    description: `${committeeProfile.departmentName}成员可查看，${committeeProfile.executivePositionNames.join("、")}可管理`,
  }, db);
}

async function ensureDepartmentSpace(departmentId: number, db: DocsEditorDb = docsEditorDb()) {
  const department = await getDepartmentContext(departmentId);
  if (!department) return null;
  return ensureSpace({
    targetType: "department",
    targetId: department.id,
    title: `${department.name}模板空间`,
    description: "部门成员可查看，负责人可管理",
  }, db);
}

async function listExplicitSpaceSeeds(userId: number): Promise<SpaceSeed[]> {
  const actionDepartmentIds = await listDirectActionGrantTargetIds(userId, "department");
  const actionRows = actionDepartmentIds.map((targetId) => ({ targetType: "department", targetId }));
  const departments = await loadExplicitDepartments(actionRows);
  const seeds = await Promise.all(actionRows.map((row) =>
    explicitRowToSeed(row, departments),
  ));
  return seeds.filter((seed): seed is SpaceSeed => Boolean(seed));
}

async function loadExplicitDepartments(rows: Array<{ targetType: string; targetId: number }>) {
  const departmentIds = rows.filter((row) => row.targetType === "department").map((row) => row.targetId);
  if (departmentIds.length === 0) return new Map<number, string>();
  const departments = await prisma.department.findMany({
    where: { id: { in: departmentIds } },
    select: { id: true, name: true },
  });
  return new Map(departments.map((department) => [department.id, department.name]));
}

async function explicitRowToSeed(
  row: { targetType: string; targetId: number },
  departmentNameById: Map<number, string>,
): Promise<SpaceSeed | null> {
  const targetType = normalizeSpaceTargetType(row.targetType);
  if (targetType !== "department" || !departmentNameById.has(row.targetId)) return null;
  return {
    targetType: "department",
    targetId: row.targetId,
    title: `${departmentNameById.get(row.targetId)}模板空间`,
    description: "部门成员可查看，负责人可管理",
  };
}

async function listDirectActionGrantTargetIds(userId: number, targetType: string) {
  const prefix = `${targetType}:`;
  const resourceKey = getSpaceChildResourceKeyForTargetType(targetType, "templates") ?? "docs.editor";
  const rows = await prisma.userResourceActionGrant.findMany({
    where: {
      userId,
      resource: { key: resourceKey },
      scopeId: { startsWith: prefix },
    },
    select: { scopeId: true },
  });
  return Array.from(new Set(rows.flatMap((row) => {
    const id = Number(row.scopeId?.slice(prefix.length));
    return Number.isInteger(id) && id > 0 ? [id] : [];
  })));
}

function hasAnySpaceAction(actions: DocsEditorSpaceActionPermissions) {
  return actions.canRead
    || actions.canCreate
    || actions.canUpdate
    || actions.canDelete
    || actions.canArchive
    || actions.canSubmit
    || actions.canApprove
    || actions.canPublish
    || actions.canExport
    || actions.canManagePermissions;
}
