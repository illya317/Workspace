import { prisma } from "./prisma";
import type { Prisma } from "./prisma";

// Models with audit fields that can be snapshotted into EditHistory.
// Keep this list aligned with actual snapshotHistory callers.
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
  "ProjectTask",
  "PositionDescription",
] as const;

type EntityType = (typeof AUDITED_MODELS)[number];

function assertEntityType(type: string): asserts type is EntityType {
  if (!(AUDITED_MODELS as readonly string[]).includes(type)) {
    throw new Error(
      `[snapshotHistory] 未注册的 entityType: "${type}"。请在 @workspace/platform/server/history 的 AUDITED_MODELS 数组中添加。`,
    );
  }
}

/** Prisma model name to client delegate key, e.g. Employee -> employee, EDP -> eDP. */
function clientKey(entityType: EntityType): string {
  return entityType.charAt(0).toLowerCase() + entityType.slice(1);
}

/**
 * Snapshot the current record into EditHistory after a successful edit.
 */
type HistoryClient = Pick<typeof prisma, "editHistory"> & Record<string, unknown>;

export async function snapshotHistory(
  entityType: string,
  entityId: number,
  userId: number,
  client: HistoryClient | Prisma.TransactionClient = prisma,
) {
  assertEntityType(entityType);

  const record = await (
    client as unknown as Record<
      string,
      { findUnique: (args: { where: { id: number } }) => Promise<Record<string, unknown> | null> }
    >
  )[clientKey(entityType)].findUnique({
    where: { id: entityId },
  });
  if (!record) return;

  const entityIdStr = String(entityId);

  const maxVer = await client.editHistory.findFirst({
    where: { entityType, entityId: entityIdStr, tag: null },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (maxVer?.version || 0) + 1;
  await client.editHistory.create({
    data: {
      entityType,
      entityId: entityIdStr,
      version: nextVersion,
      dataJson: JSON.stringify(record),
      editedBy: userId,
    },
  });
}

export async function getEditHistorySnapshot(
  entityType: string,
  entityId: string,
  version: number,
) {
  return prisma.editHistory.findFirst({
    where: { entityType, entityId, version },
  });
}

export async function listEditHistoryVersions(entityType: string, entityId: string) {
  return prisma.editHistory.findMany({
    where: { entityType, entityId },
    orderBy: { version: "desc" },
    select: { version: true, createdAt: true, editor: { select: { nickname: true, employees: { select: { name: true }, take: 1 } } } },
    take: 50,
  });
}
