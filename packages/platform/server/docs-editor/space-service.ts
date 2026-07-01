import "server-only";

import { prisma } from "../prisma";
import { getOperatingCommitteeDepartmentContext } from "../business-space-permissions";
import {
  docsEditorDb,
  type DocsEditorDb,
  type DocsEditorSpaceRow,
} from "./db";
import {
  canPublishOfficialQcTemplate,
  docsEditorPermissionKind,
  getAllDepartmentContexts,
  getDepartmentContext,
  getDocsEditorScopedActionPermissions,
  getGroupCompanyContext,
  getUserDepartmentContexts,
  resolveSpaceRole,
} from "./permissions";
import { ensureOfficialTemplates } from "./official-template-sync";
import type {
  DocsEditorPermissionRole,
  DocsEditorSpaceDto,
} from "./types";

type DocsEditorSpaceTargetType = DocsEditorSpaceDto["targetType"];

type SpaceSeed = {
  targetType: DocsEditorSpaceTargetType;
  targetId: number;
  title: string;
  description: string;
};

export type DocsEditorAccessibleSpace = {
  space: DocsEditorSpaceRow;
  role: DocsEditorPermissionRole;
};

export async function toSpaceDto(
  userId: number,
  space: DocsEditorSpaceRow,
  role: DocsEditorPermissionRole,
): Promise<DocsEditorSpaceDto> {
  const targetType = normalizeSpaceTargetType(space.targetType);
  return {
    id: String(space.id),
    kind: targetType,
    targetType,
    targetId: space.targetId,
    title: targetType === "company" ? "公司模板" : targetType === "committee" ? "运营委员会模板" : space.title,
    ...(targetType === "company"
      ? { description: "所有人可查看的公司文档模板空间" }
      : targetType === "committee"
        ? { description: "运营委员会成员可查看，执行总裁可管理" }
      : space.description ? { description: space.description } : {}),
    departmentId: targetType === "department" ? space.targetId : null,
    role,
    actionPermissions: await getDocsEditorScopedActionPermissions(userId, space),
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
  const departments = (isAdmin ? await getAllDepartmentContexts() : await getUserDepartmentContexts(userId))
    .filter((department) => department.code !== "EXC001");
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
    const role = await resolveSpaceRole(userId, space);
    if (role) result.push({ space, role });
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
  return ensureSpace({
    targetType: "committee",
    targetId: committee.id,
    title: "运营委员会模板",
    description: "运营委员会成员可查看，执行总裁可管理",
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
  const [rows, actionDepartmentIds] = await Promise.all([
    prisma.documentTemplateSpacePermission.findMany({
      where: { userId, kind: docsEditorPermissionKind() },
      select: { targetType: true, targetId: true },
    }),
    listDirectActionGrantTargetIds(userId, "docs.editor", "department"),
  ]);
  const company = await getGroupCompanyContext();
  const actionRows = actionDepartmentIds.map((targetId) => ({ targetType: "department", targetId }));
  const departments = await loadExplicitDepartments([...rows, ...actionRows]);
  const seeds = await Promise.all([...rows, ...actionRows].map((row) =>
    explicitRowToSeed(row, company, departments),
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
  company: { id: number } | null,
  departmentNameById: Map<number, string>,
): Promise<SpaceSeed | null> {
  const targetType = normalizeSpaceTargetType(row.targetType);
  if (targetType === "personal") return null;
  if (targetType === "company" && company?.id === row.targetId) {
    return {
      targetType: "company",
      targetId: company.id,
      title: "公司模板",
      description: "所有人可查看的公司文档模板空间",
    };
  }
  if (targetType === "committee") {
    const committee = await getOperatingCommitteeDepartmentContext();
    return committee && committee.id === row.targetId ? {
      targetType: "committee",
      targetId: committee.id,
      title: "运营委员会模板",
      description: "运营委员会成员可查看，执行总裁可管理",
    } : null;
  }
  if (targetType !== "department" || !departmentNameById.has(row.targetId)) return null;
  return {
    targetType: "department",
    targetId: row.targetId,
    title: `${departmentNameById.get(row.targetId)}模板空间`,
    description: "部门成员可查看，负责人可管理",
  };
}

async function listDirectActionGrantTargetIds(userId: number, resourceKey: string, targetType: string) {
  const prefix = `${targetType}:`;
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
