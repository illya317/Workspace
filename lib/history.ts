import { prisma } from "./prisma";

// 有审计字段（editedBy + version）的模型，按 Prisma 模型名注册。
// 新增审计表时在此数组加一行。
const AUDITED_MODELS = [
  "Employee",
  "Employment",
  "Company",
  "CompanyRelation",
  "Department",
  "Position",
  "EDP",
  "Project",
  "EmployeeProject",
] as const;

type EntityType = (typeof AUDITED_MODELS)[number];

function assertEntityType(type: string): asserts type is EntityType {
  if (!(AUDITED_MODELS as readonly string[]).includes(type)) {
    throw new Error(
      `[snapshotHistory] 未注册的 entityType: "${type}"。请在 lib/history.ts 的 AUDITED_MODELS 数组中添加。`
    );
  }
}

/** Prisma 模型名 → client 方法名（Employee→employee, EDP→eDP） */
function clientKey(entityType: EntityType): string {
  return entityType.charAt(0).toLowerCase() + entityType.slice(1);
}

/**
 * 编辑后调用，快照当前记录写入 EditHistory。
 */
export async function snapshotHistory(
  entityType: string,
  entityId: number,
  userId: number
) {
  assertEntityType(entityType);
  const record = await (prisma as any)[clientKey(entityType)].findUnique({
    where: { id: entityId },
  });
  if (!record) return;

  const maxVer = await prisma.editHistory.findFirst({
    where: { entityType, entityId: String(entityId) },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (maxVer?.version || 0) + 1;
  await prisma.editHistory.create({
    data: {
      entityType,
      entityId: String(entityId),
      version: nextVersion,
      dataJson: JSON.stringify(record),
      editedBy: userId,
    },
  });
}
