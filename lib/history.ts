import { prisma } from "./prisma";

/**
 * 记录编辑历史快照
 * @param entityType 实体类型（如 employee, employment 等）
 * @param entityId 实体主键（字符串）
 * @param oldData 旧数据对象
 * @param userId 编辑人用户ID
 */
export async function snapshotHistory(
  entityType: string,
  entityId: string,
  oldData: Record<string, unknown> | null,
  userId: number
) {
  if (!oldData) return;
  const maxVer = await prisma.editHistory.findFirst({
    where: { entityType, entityId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (maxVer?.version || 0) + 1;
  await prisma.editHistory.create({
    data: {
      entityType,
      entityId,
      version: nextVersion,
      dataJson: JSON.stringify(oldData),
      editedBy: userId,
    },
  });
}
