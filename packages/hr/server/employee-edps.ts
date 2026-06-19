import { snapshotHistory } from "@workspace/platform/server/history";
import { isValidDateValue, parseWorkPercent } from "./field-validation";
import { prisma } from "@workspace/platform/server/prisma";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };
type EdpBodyRow = Record<string, unknown>;

interface NormalizedEdpRow {
  id: number | null;
  employeeId: number;
  departmentId: number | null;
  positionId: number | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  workPercent: string | null;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function isCurrentByEndDate(endDate: unknown) {
  return !endDate || String(endDate) >= new Date().toISOString().slice(0, 10);
}

async function ensurePosition(id: number | null) {
  if (id === null) return true;
  const row = await prisma.position.findUnique({ where: { id }, select: { id: true } });
  return Boolean(row);
}

async function departmentIdFromPosition(positionId: number | null) {
  if (positionId === null) return null;
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { departmentId: true },
  });
  return position?.departmentId ?? null;
}

async function normalizeEdpRow(row: EdpBodyRow, employeeId: number): Promise<NormalizedEdpRow | null> {
  const id = nullableNumber(row.id);
  if (Number.isNaN(id)) return null;

  const positionId = nullableNumber(row.positionId);
  if (Number.isNaN(positionId)) return null;
  if (!(await ensurePosition(positionId))) return null;
  const departmentId = await departmentIdFromPosition(positionId);

  const startDate = nullableString(row.startDate);
  const endDate = nullableString(row.endDate);
  if (!isValidDateValue(startDate) || !isValidDateValue(endDate)) return null;

  const workPercent = nullableString(row.workPercent);
  const parsedWorkPercent = parseWorkPercent(workPercent);
  if (Number.isNaN(parsedWorkPercent) || (parsedWorkPercent !== null && (parsedWorkPercent < 0 || parsedWorkPercent > 1))) {
    return null;
  }

  return {
    id,
    employeeId,
    departmentId,
    positionId,
    isPrimary: Boolean(row.isPrimary),
    startDate,
    endDate,
    reportTo: nullableString(row.reportTo),
    workPercent,
  };
}

function validateCurrentTotal(rows: Array<{ endDate: string | null; workPercent: string | null }>) {
  const currentRows = rows.filter((row) => isCurrentByEndDate(row.endDate));
  if (currentRows.length === 0) return null;
  const values = currentRows.map((row) => parseWorkPercent(row.workPercent));
  if (values.some((value) => value === null || Number.isNaN(value))) {
    return "当前岗位的工作占比必须填写，且合计必须等于 1";
  }
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (Math.abs(total - 1) > 0.0001) return `当前岗位的工作占比合计为 ${total.toFixed(2)}，必须等于 1`;
  return null;
}

export async function updateEmployeeProfileEdps(
  employeeId: number,
  rows: unknown,
  userId: number,
): Promise<ServiceResult<{ success: true; ids: number[]; deletedIds: number[] }>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return { ok: false, error: "员工ID无效" };
  if (!Array.isArray(rows)) return { ok: false, error: "请求体无效" };

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return { ok: false, error: "员工不存在", status: 404 };

  const normalizedRows: NormalizedEdpRow[] = [];
  for (const row of rows) {
    const normalized = await normalizeEdpRow(row as EdpBodyRow, employeeId);
    if (!normalized) return { ok: false, error: "岗位记录校验失败" };
    normalizedRows.push(normalized);
  }

  const existingRows = await prisma.eDP.findMany({ where: { employeeId }, select: { id: true } });
  const existingIds = new Set(existingRows.map((row) => row.id));
  for (const row of normalizedRows) {
    if (row.id !== null && !existingIds.has(row.id)) return { ok: false, error: "岗位记录不属于该员工" };
  }

  const totalError = validateCurrentTotal(normalizedRows);
  if (totalError) return { ok: false, error: totalError };

  const changedIds: number[] = [];
  const keptIds = new Set(normalizedRows.map((row) => row.id).filter((id): id is number => id !== null));
  const deletedIds = existingRows.map((row) => row.id).filter((rowId) => !keptIds.has(rowId));

  await Promise.all(deletedIds.map((rowId) => snapshotHistory("EDP", rowId, userId)));
  await prisma.$transaction(async (tx) => {
    for (const rowId of deletedIds) {
      await tx.eDP.delete({ where: { id: rowId } });
    }
    for (const row of normalizedRows) {
      const { id: rowId, ...data } = row;
      if (rowId) {
        await tx.eDP.update({
          where: { id: rowId },
          data: { ...data, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
        });
        changedIds.push(rowId);
      } else {
        const created = await tx.eDP.create({
          data: { ...data, editedBy: userId },
          select: { id: true },
        });
        changedIds.push(created.id);
      }
    }
  });

  await Promise.all(changedIds.map((rowId) => snapshotHistory("EDP", rowId, userId)));
  return { ok: true, data: { success: true, ids: changedIds, deletedIds } };
}
