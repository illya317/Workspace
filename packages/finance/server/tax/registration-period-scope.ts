export type TaxRegistrationPeriodInput = {
  status: string;
  effectiveFrom: string | Date;
  effectiveThrough: string | Date | null;
};

export type TaxRegistrationPeriodScope = {
  inScope: boolean;
  blockerCode: "registration_suspended_scope_unproven" | "registration_end_date_missing" | null;
};

function dateOnly(value: string | Date | null) {
  if (value == null) return null;
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

function periodBounds(year: number, month: number) {
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}

export function taxRegistrationPeriodScope(
  registration: TaxRegistrationPeriodInput,
  period: { year: number; month: number },
): TaxRegistrationPeriodScope {
  const effectiveFrom = dateOnly(registration.effectiveFrom)!;
  const effectiveThrough = dateOnly(registration.effectiveThrough);
  const bounds = periodBounds(period.year, period.month);
  if (registration.status === "draft" || effectiveFrom > bounds.end) {
    return { inScope: false, blockerCode: null };
  }
  if (effectiveThrough && effectiveThrough < bounds.start) {
    return { inScope: false, blockerCode: null };
  }
  if (registration.status === "ended" && !effectiveThrough) {
    return { inScope: true, blockerCode: "registration_end_date_missing" };
  }
  if (registration.status === "suspended") {
    return { inScope: true, blockerCode: "registration_suspended_scope_unproven" };
  }
  return { inScope: registration.status === "active" || registration.status === "ended", blockerCode: null };
}
