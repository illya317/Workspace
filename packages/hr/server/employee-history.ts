import { formatVal } from "@workspace/platform/audit";
import { summarizeHistoryChanges } from "@workspace/platform/server/history-policy-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { employeeWhereFromKey } from "./employee-profile";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function userEmployeeName(user: { employees?: Array<{ name: string }> } | null | undefined) {
  return user?.employees?.[0]?.name ?? null;
}

export async function getEmployeeProfileHistoryByKey(key: string) {
  const where = employeeWhereFromKey(key);
  if (!where) return { status: "invalid" as const };

  const employee = await prisma.employee.findUnique({ where, select: { id: true } });
  if (!employee) return { status: "not_found" as const };
  const employeeId = employee.id;

  const [employments, edps] = await Promise.all([
    prisma.employment.findMany({ where: { employeeId }, select: { id: true } }),
    prisma.eDP.findMany({ where: { employeeId }, select: { id: true } }),
  ]);

  const edpHistoryRows = await prisma.editHistory.findMany({
    where: { entityType: "EDP", tag: null },
    select: { entityId: true, dataJson: true },
  });
  const historicalEdpIds = new Set<string>();
  for (const row of edpHistoryRows) {
    const snapshot = parseJson(row.dataJson);
    if (Number(snapshot.employeeId) === employeeId) historicalEdpIds.add(row.entityId);
  }

  const filters = [
    { entityType: "Employee", entityId: String(employeeId) },
    ...employments.map((item) => ({ entityType: "Employment", entityId: String(item.id) })),
    ...edps.map((item) => ({ entityType: "EDP", entityId: String(item.id) })),
    ...[...historicalEdpIds].map((entityId) => ({ entityType: "EDP", entityId })),
  ];

  const [allRows, periodRevisions] = await Promise.all([
    prisma.editHistory.findMany({
      where: { OR: filters },
      include: { editor: { select: { employees: { select: { name: true }, take: 1 } } } },
      orderBy: [{ entityType: "asc" }, { entityId: "asc" }, { version: "asc" }],
    }),
    prisma.employeePeriodRevision.findMany({
      where: { employeeId },
      include: { recordedBy: { select: { employees: { select: { name: true }, take: 1 } } } },
      orderBy: { recordedAt: "desc" },
    }),
  ]);
  const rows = allRows.filter((row) => row.tag === null);

  const groups = new Map<string, typeof allRows>();
  for (const row of allRows) {
    const groupKey = `${row.entityType}:${row.entityId}`;
    const list = groups.get(groupKey) || [];
    list.push(row);
    groups.set(groupKey, list);
  }

  const entries = [
    ...rows
    .map((row) => {
      const group = groups.get(`${row.entityType}:${row.entityId}`) || [];
      const index = group.findIndex((item) => item.id === row.id);
      const prev = index > 0 ? parseJson(group[index - 1].dataJson) : null;
      const curr = parseJson(row.dataJson);
      const changes = summarizeHistoryChanges(row.entityType, prev, curr)
        .map((change) => ({
          field: change.field,
          label: change.label ?? change.field,
          from: formatVal(change.from ?? "(空)"),
          to: formatVal(change.to),
        }));
      return {
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        version: row.version,
        editorName: userEmployeeName(row.editor) || "未知人员",
        createdAt: row.createdAt,
        action: prev ? "update" as const : "create" as const,
        changes,
      };
    })
    .filter((entry) => entry.action === "create" || entry.changes.length > 0),
    ...periodRevisions.map((revision) => {
      const before = parseJson(revision.beforeJson);
      const after = parseJson(revision.afterJson);
      const startKey = revision.entityType === "Employment" ? "joinDate" : "startDate";
      const endKey = revision.entityType === "Employment" ? "leaveDate" : "endDate";
      return {
        id: `period-revision:${revision.id}`,
        entityType: revision.entityType,
        entityId: String(revision.periodId),
        version: revision.expectedVersion + 1,
        editorName: userEmployeeName(revision.recordedBy) || "未知人员",
        createdAt: revision.recordedAt,
        action: "update" as const,
        reason: revision.reason,
        changes: [{
          field: startKey,
          label: revision.entityType === "Employment" ? "入职日期" : "任职开始日期",
          from: formatVal(before[startKey] ?? "(空)"),
          to: formatVal(after.startDate ?? "(空)"),
        }, {
          field: endKey,
          label: revision.entityType === "Employment" ? "离职日期" : "任职结束日期",
          from: formatVal(before[endKey] ?? "(空)"),
          to: formatVal(after.endDate ?? "(空)"),
        }],
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { status: "ok" as const, data: { entries } };
}
