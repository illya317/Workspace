import type { BusinessTemporalPosition } from "@workspace/platform/contracts/business-temporal";

type EmploymentPeriod = {
  id?: number;
  joinDate?: string | null;
  leaveDate?: string | null;
};

type TemporalEmployment = EmploymentPeriod & {
  temporalState: BusinessTemporalPosition;
};

const TEMPORAL_POSITION_PRIORITY: Record<BusinessTemporalPosition, number> = {
  current: 0,
  upcoming: 1,
  past: 2,
  invalid: 3,
};

/**
 * Orders employments for a single-record profile surface: current first, then the
 * nearest upcoming period, then the most recently ended period. Invalid legacy
 * rows are deliberately last.
 */
export function compareEmploymentPreference(left: TemporalEmployment, right: TemporalEmployment) {
  const stateOrder = TEMPORAL_POSITION_PRIORITY[left.temporalState]
    - TEMPORAL_POSITION_PRIORITY[right.temporalState];
  if (stateOrder !== 0) return stateOrder;

  if (left.temporalState === "upcoming") {
    const startOrder = (left.joinDate ?? "9999-99-99").localeCompare(right.joinDate ?? "9999-99-99");
    if (startOrder !== 0) return startOrder;
  } else {
    const leftAnchor = left.leaveDate || left.joinDate || "";
    const rightAnchor = right.leaveDate || right.joinDate || "";
    const dateOrder = rightAnchor.localeCompare(leftAnchor);
    if (dateOrder !== 0) return dateOrder;
  }

  return (right.id ?? 0) - (left.id ?? 0);
}

export function orderEmploymentsByPreference<T extends TemporalEmployment>(rows: readonly T[]) {
  return [...rows].sort(compareEmploymentPreference);
}

export function preferredEmployment<T extends TemporalEmployment>(rows: readonly T[]): T | null {
  return orderEmploymentsByPreference(rows)[0] ?? null;
}

export function employmentsContainingDate<T extends EmploymentPeriod>(
  rows: readonly T[],
  date: string,
): T[] {
  return rows.filter((row) => (
    row.id != null
    && (!row.joinDate || row.joinDate <= date)
    && (!row.leaveDate || row.leaveDate >= date)
  ));
}

export function employmentForAgreementDate(
  employments: readonly EmploymentPeriod[],
  effectiveFrom: string,
): { ok: true; id: number } | { ok: false; message: string } {
  const matches = employmentsContainingDate(employments, effectiveFrom);
  if (matches.length === 0) {
    return { ok: false, message: "合同开始日期不在任何雇佣期间内，请先补录或修订雇佣周期" };
  }
  if (matches.length > 1) {
    return { ok: false, message: "合同开始日期命中多条雇佣周期，请先修订重叠的雇佣历史" };
  }
  return { ok: true, id: matches[0]!.id! };
}
