import { Prisma, prisma } from "./prisma";
import { fkDisplay, resolveFkValues } from "./resolve-fk";

const RESOLVERS: Record<string, { model: string; field: string; fallback: string }> = {
  Employee: { model: "employee", field: "name", fallback: "未知员工" },
  Employment: { model: "employment", field: "id", fallback: "未知雇佣" },
  Company: { model: "company", field: "name", fallback: "未知公司" },
  CompanyRelation: { model: "companyRelation", field: "id", fallback: "未知关系" },
  Department: { model: "department", field: "name", fallback: "未知部门" },
  Position: { model: "position", field: "name", fallback: "未知岗位" },
  EDP: { model: "eDP", field: "id", fallback: "未知关联" },
  Project: { model: "project", field: "name", fallback: "未知项目" },
  EmployeeProject: { model: "employeeProject", field: "id", fallback: "未知关联" },
};

function userEmployeeName(user: { nickname: string; employees?: Array<{ name: string }> } | null | undefined) {
  return user?.employees?.[0]?.name ?? user?.nickname ?? null;
}

async function resolveRecordNames(entityType: string, ids: number[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (entityType === "EDP") {
    const edps = await prisma.eDP.findMany({
      where: { id: { in: ids } },
      include: { employee: { select: { name: true } } },
    });
    for (const edp of edps) map[String(edp.id)] = edp.employee?.name || String(edp.id);
  } else if (entityType === "EmployeeProject") {
    const projectMembers = await prisma.employeeProject.findMany({
      where: { id: { in: ids } },
      include: { employee: { select: { name: true } }, project: { select: { name: true } } },
    });
    for (const projectMember of projectMembers) {
      map[String(projectMember.id)] = `${projectMember.employee?.name || "?"} / ${projectMember.project?.name || "?"}`;
    }
  } else if (entityType === "Employment") {
    const employments = await prisma.employment.findMany({
      where: { id: { in: ids } },
      include: { employee: { select: { name: true } } },
    });
    for (const employment of employments) map[String(employment.id)] = employment.employee?.name || String(employment.id);
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
  changes: Array<{ field: string; from?: string; to: string }>;
}

export type RestoreAuditLogSnapshotResult =
  | { success: true }
  | { success: false; status: number; error: string };

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
  const resolver = RESOLVERS[entityType];
  if (resolver) {
    const unresolved = recordIds.filter((id) => !recordMap[String(id)]);
    if (unresolved.length > 0) {
      type ModelDelegate = {
        findMany: (args: {
          where: { id: { in: number[] } };
          select: Record<string, boolean>;
        }) => Promise<Array<{ id: unknown; [key: string]: unknown }>>;
      };
      const records = await ((prisma as unknown as Record<string, ModelDelegate>)[resolver.model]).findMany({
        where: { id: { in: unresolved } },
        select: { id: true, [resolver.field]: true },
      });
      for (const record of records) recordMap[String(record.id)] = String(record[resolver.field] ?? resolver.fallback);
    }
  }
  for (const id of recordIds) if (!recordMap[String(id)]) recordMap[String(id)] = String(id);

  const auditFields = new Set(["editedBy", "editedAt", "version", "editor", "createdAt", "updatedAt", "id"]);

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
      const changes: Array<{ field: string; from?: string; to: string }> = [];
      try {
        const currentData = JSON.parse(version.dataJson);
        const previousData = previous ? JSON.parse(previous.dataJson) : null;
        if (previousData) {
          const keys = new Set([...Object.keys(currentData), ...Object.keys(previousData)]);
          for (const key of keys) {
            if (auditFields.has(key)) continue;
            const current = currentData[key];
            const old = previousData[key];
            if (JSON.stringify(old) !== JSON.stringify(current)) {
              const fromRaw = old != null ? (typeof old === "object" ? JSON.stringify(old) : String(old)) : "";
              const toRaw = current != null ? (typeof current === "object" ? JSON.stringify(current) : String(current)) : "";
              changes.push({
                field: key,
                from: fromRaw ? fkDisplay(key, fromRaw, fkMap, { entityType: version.entityType }) : "(空)",
                to: toRaw ? fkDisplay(key, toRaw, fkMap, { entityType: version.entityType }) : "(空)",
              });
            }
          }
        }
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
        changes,
      };
    });

  return { entries, total, page, pageSize };
}

export async function restoreAuditLogSnapshot(
  historyId: number,
): Promise<RestoreAuditLogSnapshotResult> {
  const snapshot = await prisma.editHistory.findUnique({ where: { id: historyId } });
  if (!snapshot) return { success: false, status: 404, error: "版本不存在" };

  const resolver = RESOLVERS[snapshot.entityType];
  if (!resolver) return { success: false, status: 400, error: "不支持的实体类型" };

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(snapshot.dataJson) as Record<string, unknown>;
  } catch {
    return { success: false, status: 500, error: "数据格式错误" };
  }

  delete data.id;
  const entityId = parseInt(snapshot.entityId);

  type ModelDelegate = {
    findUnique: (args: { where: { id: number } }) => Promise<unknown>;
    update: (args: { where: { id: number }; data: unknown }) => Promise<unknown>;
    create: (args: { data: unknown }) => Promise<unknown>;
  };
  const model = (prisma as unknown as Record<string, ModelDelegate>)[resolver.model];
  const exists = await model.findUnique({ where: { id: entityId } });
  if (exists) {
    await model.update({ where: { id: entityId }, data });
  } else {
    await model.create({ data: { ...data, id: entityId } });
  }

  return { success: true };
}
