export const EMPLOYMENT_AGREEMENT_BASELINE_REQUIRED_FIELDS: readonly ["terms.*.effectiveFrom"];
export const EMPLOYMENT_AGREEMENT_BASELINE_TRACKED_FIELDS: readonly string[];

export function employmentAgreementBaselineFieldRequired(fieldPath: string): boolean;
export function employmentAgreementBaselineMissingFields(
  content: Record<string, unknown>,
  terms: ReadonlyArray<{
    sequence: number;
    termKind: string;
    effectiveFrom: string | null;
    effectiveThrough: string | null;
  }>,
): string[];
