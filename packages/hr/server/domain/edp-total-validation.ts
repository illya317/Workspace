import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { parseWorkPercent } from "../field-validation";

interface EdpCurrentTotalRow {
  id?: number | null;
  endDate: string | null;
  workPercent: string | null;
}

interface EdpCreateTotalCommand extends EdpCurrentTotalRow {
  employeeId: number;
}

function isCurrentByEndDate(endDate: unknown) {
  return !endDate || String(endDate) >= new Date().toISOString().slice(0, 10);
}

export function validateCurrentTotal(rows: EdpCurrentTotalRow[]) {
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

export function edpUpdateAffectsCurrentTotal(data: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(data, "endDate")
    || Object.prototype.hasOwnProperty.call(data, "workPercent");
}

export async function validateEdpCreateCurrentTotal(
  command: EdpCreateTotalCommand,
): Promise<DomainValidationResult<true>> {
  const existingRows = await prisma.eDP.findMany({
    where: { employeeId: command.employeeId },
    select: { id: true, endDate: true, workPercent: true },
  });
  const error = validateCurrentTotal([...existingRows, command]);
  return error ? failCommand(error) : okCommand(true);
}

export async function validateEdpFieldUpdateCurrentTotal(
  recordId: number,
  data: Record<string, unknown>,
): Promise<DomainValidationResult<true>> {
  const target = await prisma.eDP.findUnique({
    where: { id: recordId },
    select: { id: true, employeeId: true },
  });
  if (!target) return failCommand("岗位记录不存在", 404);

  const rows = await prisma.eDP.findMany({
    where: { employeeId: target.employeeId },
    select: { id: true, endDate: true, workPercent: true },
  });
  const candidateRows = rows.map((row) => {
    if (row.id !== target.id) return row;
    return {
      ...row,
      endDate: Object.prototype.hasOwnProperty.call(data, "endDate") ? (data.endDate as string | null) : row.endDate,
      workPercent: Object.prototype.hasOwnProperty.call(data, "workPercent")
        ? (data.workPercent as string | null)
        : row.workPercent,
    };
  });
  const error = validateCurrentTotal(candidateRows);
  return error ? failCommand(error) : okCommand(true);
}
