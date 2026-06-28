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

function userEmployeeName(user: { nickname: string; employees?: Array<{ name: string }> } | null | undefined) {
  return user?.employees?.[0]?.name ?? user?.nickname ?? null;
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

  const allRows = await prisma.editHistory.findMany({
    where: { OR: filters },
    include: { editor: { select: { nickname: true, employees: { select: { name: true }, take: 1 } } } },
    orderBy: [{ entityType: "asc" }, { entityId: "asc" }, { version: "asc" }],
  });
  const rows = allRows.filter((row) => row.tag === null);

  const groups = new Map<string, typeof allRows>();
  for (const row of allRows) {
    const groupKey = `${row.entityType}:${row.entityId}`;
    const list = groups.get(groupKey) || [];
    list.push(row);
    groups.set(groupKey, list);
  }

  const entries = rows
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
        editorName: userEmployeeName(row.editor) || `用户#${row.editedBy}`,
        createdAt: row.createdAt,
        action: prev ? "update" as const : "create" as const,
        changes,
      };
    })
    .filter((entry) => entry.action === "create" || entry.changes.length > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { status: "ok" as const, data: { entries } };
}
