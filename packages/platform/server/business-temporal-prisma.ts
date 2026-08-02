import {
  inclusiveBusinessPeriodContains,
  requireBusinessDate,
  type BusinessDate,
} from "@workspace/platform/contracts/business-temporal";
import { workspaceBusinessDate } from "./business-date";

/**
 * Builds the canonical inclusive-period predicate for legacy string date columns.
 * Callers must cross the BusinessDate parsing seam before constructing a query.
 */
export function inclusiveBusinessPeriodWhere<T extends Record<string, unknown>>(
  extra: T,
  startField: string,
  endField: string,
  date: BusinessDate,
) {
  const { AND: existingAnd, ...rest } = extra;
  const previousAnd = existingAnd === undefined
    ? []
    : Array.isArray(existingAnd)
      ? existingAnd
      : [existingAnd];
  return {
    ...rest,
    AND: [
      ...previousAnd,
      { OR: [{ [startField]: null }, { [startField]: "" }, { [startField]: { lte: date } }] },
      { OR: [{ [endField]: null }, { [endField]: "" }, { [endField]: { gte: date } }] },
    ],
  };
}

export function currentInclusiveBusinessPeriodWhere<T extends Record<string, unknown>>(
  extra: T = {} as T,
  startField = "startDate",
  endField = "endDate",
  at = new Date(),
) {
  return inclusiveBusinessPeriodWhere(
    extra,
    startField,
    endField,
    requireBusinessDate(workspaceBusinessDate(at)),
  );
}

/**
 * Transitional Employment predicate. The boolean is consulted only for undated
 * legacy rows; dated rows always use the Business Temporal period.
 */
export function employmentPeriodWhereAt<T extends Record<string, unknown>>(
  extra: T = {} as T,
  date: BusinessDate,
) {
  const where = inclusiveBusinessPeriodWhere(extra, "joinDate", "leaveDate", date);
  return {
    ...where,
    AND: [
      ...where.AND,
      {
        OR: [
          { AND: [{ joinDate: { not: null } }, { joinDate: { not: "" } }] },
          { AND: [{ leaveDate: { not: null } }, { leaveDate: { not: "" } }] },
          { isActive: true },
        ],
      },
    ],
  };
}

export function currentEmploymentPeriodWhere<T extends Record<string, unknown>>(
  extra: T = {} as T,
  at = new Date(),
) {
  return employmentPeriodWhereAt(extra, requireBusinessDate(workspaceBusinessDate(at)));
}

export function employmentPeriodContains(
  employment: { isActive: boolean; joinDate?: string | null; leaveDate?: string | null },
  date: BusinessDate,
) {
  const joinDate = employment.joinDate?.trim() || null;
  const leaveDate = employment.leaveDate?.trim() || null;
  if (!joinDate && !leaveDate) return employment.isActive;
  return inclusiveBusinessPeriodContains({ validFrom: joinDate, validThrough: leaveDate }, date);
}
