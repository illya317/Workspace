import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { validateAssignmentTimeline } from "./employee-lifecycle-validation";

interface EdpCurrentTotalRow {
  id?: number | null;
  startDate: string | null;
  endDate: string | null;
  workPercent: string | null;
  isPrimary: boolean;
}

interface EdpCreateTotalCommand extends EdpCurrentTotalRow {
  employeeId: number;
}

export function validateCurrentTotal(rows: EdpCurrentTotalRow[]) {
  return validateAssignmentTimeline(rows.map((row) => ({
    ...row,
    workPercent: row.workPercent ?? "",
  })), workspaceBusinessDate(new Date()));
}

export function edpUpdateAffectsCurrentTotal(data: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(data, "endDate")
    || Object.prototype.hasOwnProperty.call(data, "startDate")
    || Object.prototype.hasOwnProperty.call(data, "workPercent")
    || Object.prototype.hasOwnProperty.call(data, "isPrimary");
}

export async function validateEdpCreateCurrentTotal(
  command: EdpCreateTotalCommand,
): Promise<DomainValidationResult<true>> {
  const existingRows = await prisma.eDP.findMany({
    where: { employeeId: command.employeeId },
    select: { id: true, startDate: true, endDate: true, workPercent: true, isPrimary: true },
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
    select: { id: true, startDate: true, endDate: true, workPercent: true, isPrimary: true },
  });
  const candidateRows = rows.map((row) => {
    if (row.id !== target.id) return row;
    return {
      ...row,
      startDate: Object.prototype.hasOwnProperty.call(data, "startDate") ? (data.startDate as string | null) : row.startDate,
      endDate: Object.prototype.hasOwnProperty.call(data, "endDate") ? (data.endDate as string | null) : row.endDate,
      workPercent: Object.prototype.hasOwnProperty.call(data, "workPercent")
        ? (data.workPercent as string | null)
        : row.workPercent,
      isPrimary: Object.prototype.hasOwnProperty.call(data, "isPrimary") ? Boolean(data.isPrimary) : row.isPrimary,
    };
  });
  const error = validateCurrentTotal(candidateRows);
  return error ? failCommand(error) : okCommand(true);
}
