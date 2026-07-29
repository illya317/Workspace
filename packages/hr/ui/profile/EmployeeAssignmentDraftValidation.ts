import type { EdpRow } from "@workspace/hr/types";

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function parseAllocationWeight(value: unknown) {
  if (value === undefined || value === "" || value === null) return null;
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

export function validateCurrentAssignments(rows: EdpRow[]) {
  const today = todayText();
  const boundaries = new Set<string>([today]);
  for (const row of rows) {
    if (row.startDate && row.startDate >= today) boundaries.add(row.startDate);
    if (row.endDate) {
      const next = new Date(`${row.endDate}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const nextDate = next.toISOString().slice(0, 10);
      if (nextDate >= today) boundaries.add(nextDate);
    }
  }
  for (const date of [...boundaries].sort()) {
    const activeRows = rows.filter((row) => (
      (!row.startDate || row.startDate <= date) && (!row.endDate || row.endDate >= date)
    ));
    if (activeRows.length === 0) continue;
    const values = activeRows.map((row) => parseAllocationWeight(row.allocationWeight));
    if (values.some((value) => value === null || Number.isNaN(value) || value <= 0)) {
      return { ok: false, message: `${date} 生效的岗位投入权重必须填写且大于 0。` };
    }
    if (activeRows.filter((row) => row.isPrimary).length !== 1) {
      return { ok: false, message: `${date} 生效的岗位必须且只能有一个主岗。` };
    }
  }
  return { ok: true, message: "" };
}

function isBlankNewEdp(row: EdpRow) {
  return Boolean(row.isNew)
    && !row.positionId
    && !row.startDate
    && !row.endDate
    && !row.reportTo
    && !row.allocationWeight
    && !row.isPrimary;
}

export function persistableEdpRows(rows: EdpRow[]) {
  return rows.filter((row) => !isBlankNewEdp(row));
}
