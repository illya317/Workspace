import { prisma } from "./prisma";
import type { Prisma } from "./prisma";
import {
  assertTrackedHistoryPolicy,
  getHistoryModelDelegate,
  type HistoryClient,
  type HistoryPolicy,
} from "./history-policy-registry";

async function readRecord(
  policy: HistoryPolicy,
  entityId: number,
  client: HistoryClient | Prisma.TransactionClient,
) {
  return getHistoryModelDelegate(client as HistoryClient, policy).findUnique({
    where: { id: entityId },
  });
}

/**
 * Preserve the pre-edit state once for records that existed before audit
 * history was available. Creates never call this, so V1 remains the create
 * snapshot for newly inserted records.
 */
export async function ensureEditHistoryBaseline(
  entityType: string,
  entityId: number,
  userId: number,
  client: HistoryClient | Prisma.TransactionClient = prisma,
) {
  const policy = assertTrackedHistoryPolicy(entityType, "ensureEditHistoryBaseline");
  if (policy.baseline === "never") return;

  const entityIdStr = String(entityId);
  const existing = await client.editHistory.findFirst({
    where: {
      entityType,
      entityId: entityIdStr,
      OR: [{ tag: "V0:baseline" }, { tag: null }],
    },
    select: { id: true },
  });
  if (existing) return;

  const record = await readRecord(policy, entityId, client);
  if (!record) return;

  await client.editHistory.create({
    data: {
      entityType,
      entityId: entityIdStr,
      version: 0,
      tag: "V0:baseline",
      dataJson: JSON.stringify(record),
      editedBy: userId,
    },
  });
}

/**
 * Snapshot the current record after a successful edit or create.
 */
export async function snapshotHistory(
  entityType: string,
  entityId: number,
  userId: number,
  client: HistoryClient | Prisma.TransactionClient = prisma,
) {
  const policy = assertTrackedHistoryPolicy(entityType, "snapshotHistory");

  const record = await readRecord(policy, entityId, client);
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
