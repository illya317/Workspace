import "server-only";

import {
  serviceError,
  serviceOk,
  type ServiceResult,
} from "../api";
import { prisma } from "../prisma";
import { docsEditorDb } from "./db";
import {
  docsEditorPermissionKind,
  getActorDocsEditorAdmin,
  getDocsEditorSpaceRole,
  isDocsEditorRoleAtLeast,
  listNaturalDocsEditorManagers,
  loadDocsEditorPermissionUsers,
  normalizeDocsEditorRole,
  resolveSpaceRole,
} from "./permissions";
import type { DocsEditorSpacePermissionDto } from "./types";

export async function listSpacePermissions(input: {
  userId: number;
  spaceId: number;
}): Promise<ServiceResult<{ permissions: DocsEditorSpacePermissionDto[] }>> {
  const db = docsEditorDb();
  const space = await db.documentTemplateSpace.findFirst({ where: { id: input.spaceId, deletedAt: null } });
  if (!space) return serviceError("模板空间不存在", 404);
  const role = await resolveSpaceRole(input.userId, space);
  if (!isDocsEditorRoleAtLeast(role, "manager")) return serviceError("无权限管理该模板空间", 403);

  const [explicit, naturalManagers, actorAdmin] = await Promise.all([
    db.documentTemplateSpacePermission.findMany({
      where: { targetType: space.targetType, targetId: space.targetId, kind: docsEditorPermissionKind() },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    }),
    listNaturalDocsEditorManagers(space.targetType, space.targetId),
    getActorDocsEditorAdmin(input.userId),
  ]);
  const userNames = await loadDocsEditorPermissionUsers(explicit.map((item) => item.userId));
  const lockedManagers = dedupeUsers([
    ...(actorAdmin ? [actorAdmin] : []),
    ...naturalManagers,
  ]);
  return serviceOk({
    permissions: [
      ...lockedManagers.map((item) => ({
        ...item,
        role: "manager" as const,
        kind: docsEditorPermissionKind() as "template",
        source: "natural" as const,
        locked: true,
      })),
      ...explicit.map((item) => ({
        userId: item.userId,
        userName: userNames.get(item.userId) || `用户 ${item.userId}`,
        role: normalizeDocsEditorRole(item.role),
        kind: docsEditorPermissionKind() as "template",
        source: "explicit" as const,
        locked: false,
      })),
    ],
  });
}

export async function updateSpacePermissions(input: {
  userId: number;
  spaceId: number;
  permissions: Array<{ userId: number; role: string }>;
}): Promise<ServiceResult<{ success: true }>> {
  const db = docsEditorDb();
  const space = await db.documentTemplateSpace.findFirst({ where: { id: input.spaceId, deletedAt: null } });
  if (!space) return serviceError("模板空间不存在", 404);
  const role = await getDocsEditorSpaceRole(input.userId, space.targetType, space.targetId);
  if (!isDocsEditorRoleAtLeast(role, "manager")) return serviceError("无权限管理该模板空间", 403);

  const rows = input.permissions
    .map((item) => ({
      userId: Number(item.userId),
      role: normalizeDocsEditorRole(item.role),
    }))
    .filter((item) => Number.isInteger(item.userId) && item.userId > 0 && isDocsEditorRoleAtLeast(item.role, "viewer"));
  const users = rows.length ? await prisma.user.findMany({ where: { id: { in: rows.map((item) => item.userId) } }, select: { id: true } }) : [];
  const userIds = new Set(users.map((user) => user.id));
  if (rows.some((row) => !userIds.has(row.userId))) return serviceError("授权用户不存在", 400);

  await db.$transaction(async (tx) => {
    await tx.documentTemplateSpacePermission.deleteMany({
      where: { targetType: space.targetType, targetId: space.targetId, kind: docsEditorPermissionKind() },
    });
    if (rows.length > 0) {
      await tx.documentTemplateSpacePermission.createMany({
        data: rows.map((item) => ({
          targetType: space.targetType,
          targetId: space.targetId,
          userId: item.userId,
          role: item.role,
          kind: docsEditorPermissionKind(),
        })),
      });
    }
  });
  return serviceOk({ success: true });
}

function dedupeUsers<T extends { userId: number }>(items: T[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.userId)) return false;
    seen.add(item.userId);
    return true;
  });
}
