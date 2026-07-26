import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import {
  normalizeEdpRow,
  type NormalizedEdpRow,
} from "./edp-validation";
import { validateCurrentTotal } from "./edp-total-validation";

/** Validates the employee-profile assignment group without allowing period history to disappear. */
export async function buildSaveEmployeeEdpsCommand(
  employeeId: number,
  rows: unknown,
): Promise<DomainValidationResult<{ rows: NormalizedEdpRow[] }>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return failCommand("员工ID无效");
  if (!Array.isArray(rows)) return failCommand("请求体无效");

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return failCommand("员工不存在", 404);

  const normalizedRows: NormalizedEdpRow[] = [];
  for (const row of rows) {
    const normalized = await normalizeEdpRow(row as Record<string, unknown>, employeeId);
    if (!normalized.ok) return failCommand(normalized.issue.message, normalized.issue.status);
    normalizedRows.push(normalized.data);
  }

  const existingRows = await prisma.eDP.findMany({ where: { employeeId }, select: { id: true } });
  const existingIds = new Set(existingRows.map((row) => row.id));
  for (const row of normalizedRows) {
    if (row.id !== null && !existingIds.has(row.id)) return failCommand("岗位记录不属于该员工");
  }

  const totalError = validateCurrentTotal(normalizedRows);
  if (totalError) return failCommand(totalError);

  const keptIds = new Set(normalizedRows.map((row) => row.id).filter((id): id is number => id !== null));
  if (existingRows.some((row) => !keptIds.has(row.id))) {
    return failCommand("任职期间不能直接删除；请通过生命周期变更或结束日期保留期间历史", 409);
  }
  return okCommand({ rows: normalizedRows });
}
