import { formatVal, label } from "@workspace/platform/audit";
import { prisma } from "@workspace/platform/server/prisma";
import { employeeWhereFromKey } from "./employee-profile";

const AUDIT_FIELDS = new Set(["editedBy", "editedAt", "version", "editor", "createdAt", "updatedAt", "id"]);
const CONTRACT_FIELDS = [
  "company",
  "isPrimary",
  "insuranceStatus",
  "legalRelation",
  "contractType",
  "employmentForm",
  "firstContractStartDate",
  "firstContractEndDate",
  "secondContractStartDate",
  "secondContractEndDate",
  "thirdContractStartDate",
  "thirdContractEndDate",
  "permanentContractDate",
  "confidentialityDate",
  "nonCompeteDate",
  "endDate",
];

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseContracts(value: unknown) {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
  } catch {}
  return [];
}

function diffSnapshot(prev: Record<string, unknown> | null, curr: Record<string, unknown>) {
  const changes: Array<{ field: string; label: string; from: string; to: string }> = [];
  const keys = new Set([...Object.keys(curr), ...(prev ? Object.keys(prev) : [])]);
  for (const key of keys) {
    if (AUDIT_FIELDS.has(key)) continue;
    if (key === "contracts") {
      const prevContracts = parseContracts(prev?.contracts);
      const currContracts = parseContracts(curr.contracts);
      const count = Math.max(prevContracts.length, currContracts.length);
      for (let index = 0; index < count; index += 1) {
        const prevContract = prevContracts[index] || {};
        const currContract = currContracts[index] || {};
        for (const field of CONTRACT_FIELDS) {
          const oldValue = prevContract[field];
          const newValue = currContract[field];
          if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
          changes.push({
            field: `contracts.${index}.${field}`,
            label: `合同${index + 1} · ${label(field)}`,
            from: formatVal(String(oldValue ?? "(空)")),
            to: formatVal(String(newValue ?? "(空)")),
          });
        }
      }
      continue;
    }
    const oldValue = prev?.[key];
    const newValue = curr[key];
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
    changes.push({
      field: key,
      label: label(key),
      from: formatVal(String(oldValue ?? "(空)")),
      to: formatVal(String(newValue ?? "(空)")),
    });
  }
  return changes;
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

  const rows = await prisma.editHistory.findMany({
    where: { OR: filters, tag: null },
    include: { editor: { select: { name: true } } },
    orderBy: [{ entityType: "asc" }, { entityId: "asc" }, { version: "asc" }],
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
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
      return {
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        version: row.version,
        editorName: row.editor?.name || `用户#${row.editedBy}`,
        createdAt: row.createdAt,
        changes: diffSnapshot(prev, curr),
      };
    })
    .filter((entry) => entry.changes.length > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { status: "ok" as const, data: { entries } };
}
