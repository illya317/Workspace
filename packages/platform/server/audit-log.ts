import { Prisma, prisma } from "./prisma";
import { fkDisplay, resolveFkValues } from "./resolve-fk";
import {
  buildHistoryRestoreAuditMetadata,
  buildHistoryRestoreData,
  getHistoryModelDelegate,
  getHistoryPolicy,
  getRestorableHistoryPolicy,
  summarizeHistoryChanges,
  type HistoryChange,
  type HistoryClient,
} from "./history-policy-registry";
import { snapshotHistory } from "./history";

function userEmployeeName(user: { nickname: string; employees?: Array<{ name: string }> } | null | undefined) {
  return user?.employees?.[0]?.name ?? user?.nickname ?? null;
}

function historyClient() {
  return prisma as unknown as HistoryClient;
}

async function resolveRecordNames(entityType: string, ids: number[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const policy = getHistoryPolicy(entityType);
  if (!policy) return map;

  if (policy.displayName.resolveNames) {
    Object.assign(map, await policy.displayName.resolveNames(ids, historyClient()));
  }

  if (policy.displayName.field) {
    const unresolved = ids.filter((id) => !map[String(id)]);
    if (unresolved.length > 0) {
      const model = getHistoryModelDelegate(historyClient(), policy);
      const records = await model.findMany?.({
        where: { id: { in: unresolved } },
        select: { id: true, [policy.displayName.field]: true },
      });
      for (const record of records ?? []) {
        map[String(record.id)] = String(record[policy.displayName.field] ?? policy.displayName.fallback);
      }
    }
  }
  return map;
}

export interface AuditLogEntry {
  id: number;
  entityId: string;
  entityName: string;
  version: number;
  editorName: string;
  createdAt: Date;
  tag: string | null;
  action: "create" | "update";
  canRestore: boolean;
  changes: HistoryChange[];
}

export type RestoreAuditLogSnapshotResult =
  | { success: true }
  | { success: false; status: number; error: string };

export type RestoreAuditLogSnapshotOptions = {
  allowedEntityTypes?: readonly string[];
};

function isEntityAllowed(entityType: string, allowedEntityTypes: readonly string[] | undefined) {
  return !allowedEntityTypes || allowedEntityTypes.includes(entityType);
}

export async function getAuditLogDates(entityType: string) {
  const rows = await prisma.editHistory.findMany({
    where: { entityType, tag: null },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return [...new Set(rows.map((row) => row.createdAt.toISOString().slice(0, 10)))];
}

export async function getAuditLogEntries(
  entityType: string,
  date: string | undefined,
  page: number,
  pageSize: number,
) {
  const pageWhere: Prisma.EditHistoryWhereInput = { entityType, tag: null };
  if (date) {
    pageWhere.createdAt = {
      gte: new Date(`${date}T00:00:00+08:00`),
      lte: new Date(`${date}T23:59:59+08:00`),
    };
  }

  const pageVersions = await prisma.editHistory.findMany({
    where: pageWhere,
    orderBy: { createdAt: "desc" },
    take: pageSize,
    skip: (page - 1) * pageSize,
    include: { editor: { select: { nickname: true, employees: { select: { name: true }, take: 1 } } } },
  });
  const total = await prisma.editHistory.count({ where: pageWhere });

  const recordIds = [...new Set(pageVersions.map((version) => parseInt(version.entityId)))];
  const recordIdStrs = recordIds.map(String);

  const allVersions = await prisma.editHistory.findMany({
    where: { entityType, entityId: { in: recordIdStrs } },
    orderBy: { version: "asc" },
    include: { editor: { select: { nickname: true, employees: { select: { name: true }, take: 1 } } } },
  });

  type VersionWithEditor = Prisma.EditHistoryGetPayload<{ include: { editor: { select: { nickname: true; employees: { select: { name: true }; take: 1 } } } } }>;
  const prevMap = new Map<number, VersionWithEditor>();
  const groupMap = new Map<string, VersionWithEditor[]>();
  for (const version of allVersions) {
    const key = `${version.entityType}:${version.entityId}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(version);
  }
  for (const [, group] of groupMap) {
    for (let index = 1; index < group.length; index += 1) prevMap.set(group[index].id, group[index - 1]);
  }

  const recordMap = await resolveRecordNames(entityType, recordIds);
  for (const id of recordIds) if (!recordMap[String(id)]) recordMap[String(id)] = String(id);

  const allSnapshots = allVersions.map((version) => {
    try {
      return JSON.parse(version.dataJson);
    } catch {
      return {};
    }
  });
  const fkMap = await resolveFkValues(allSnapshots, { entityType });

  const entries: AuditLogEntry[] = pageVersions
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((version) => {
      const previous = prevMap.get(version.id) || null;
      let changes: HistoryChange[] = [];
      try {
        const currentData = JSON.parse(version.dataJson);
        const previousData = previous ? JSON.parse(previous.dataJson) : null;
        changes = summarizeHistoryChanges(version.entityType, previousData, currentData, {
          fkMap,
          formatValue: (field, value) => {
            if (value == null) return "(空)";
            const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
            return fkDisplay(field, raw, fkMap, { entityType: version.entityType });
          },
        });
      } catch {
        // Malformed snapshots are ignored rather than blocking audit browsing.
      }

      return {
        id: version.id,
        entityId: version.entityId,
        entityName: recordMap[version.entityId] || version.entityId,
        version: version.version,
        editorName: userEmployeeName(version.editor) || `用户#${version.editedBy}`,
        createdAt: version.createdAt,
        tag: version.tag || null,
        action: previous ? "update" : "create",
        canRestore: Boolean(getRestorableHistoryPolicy(version.entityType)),
        changes,
      };
    });

  return { entries, total, page, pageSize };
}

export async function restoreAuditLogSnapshot(
  historyId: number,
  userId: number,
  options: RestoreAuditLogSnapshotOptions = {},
): Promise<RestoreAuditLogSnapshotResult> {
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.editHistory.findUnique({ where: { id: historyId } });
    if (!snapshot) return { success: false, status: 404, error: "版本不存在" };
    if (!isEntityAllowed(snapshot.entityType, options.allowedEntityTypes)) {
      return { success: false, status: 403, error: "无权限" };
    }

    const policy = getRestorableHistoryPolicy(snapshot.entityType);
    if (!policy) return { success: false, status: 400, error: "该实体不允许恢复历史版本" };

    let data: Record<string, unknown>;
    try {
      data = buildHistoryRestoreData(policy, JSON.parse(snapshot.dataJson) as Record<string, unknown>);
    } catch {
      return { success: false, status: 500, error: "数据格式错误" };
    }

    const entityId = parseInt(snapshot.entityId, 10);
    if (!Number.isInteger(entityId)) return { success: false, status: 500, error: "实体编号格式错误" };

    const txClient = tx as unknown as HistoryClient;
    const model = getHistoryModelDelegate(txClient, policy);
    if (!model.update || !model.create) return { success: false, status: 500, error: "该实体缺少恢复所需的写入能力" };
    const exists = await model.findUnique({ where: { id: entityId } });
    if (exists) {
      await model.update({
        where: { id: entityId },
        data: { ...data, ...buildHistoryRestoreAuditMetadata(policy, userId, "update") },
      });
    } else {
      await model.create({
        data: { ...data, id: entityId, ...buildHistoryRestoreAuditMetadata(policy, userId, "create") },
      });
    }
    await snapshotHistory(snapshot.entityType, entityId, userId, tx);

    return { success: true };
  });
}
