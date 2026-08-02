/**
 * Governs legacy baseline ingestion separately from online lifecycle commands.
 * Business validity and data completeness are deliberately separate decisions:
 * an incomplete imported fact remains visible, while exact-date automation may
 * require its missing boundary to be corrected first.
 */
export interface BusinessTemporalBaselinePolicy {
  /** Compatible legacy facts are loaded into the authoritative models before online use. */
  persistence: "preload-authority";
  /** A missing inactive/cancelled marker never invents an invalid business fact. */
  missingRecordState: "confirm-unless-explicitly-inactive";
  /** A missing lower boundary is treated as open for continuity and marked incomplete. */
  missingValidFrom: "open-boundary-with-quality-marker";
  /** A missing upper boundary means no known end, rather than an inferred termination. */
  missingValidThrough: "open-boundary";
  /** Optional non-boundary attributes remain null and may be shown as non-blocking data-quality hints. */
  missingAttributes: "null-with-nonblocking-quality-marker";
  /** Completing a known gap is a patch-only command and may not rewrite fields that already contain facts. */
  missingFieldCompletion: "separate-patch-command";
  /** Missing fields are edited in place on the authoritative view instead of opening a duplicate form. */
  missingFieldPresentation: "inline-editable";
  /** Known facts remain read-only while missing fields are being completed. */
  knownFieldPresentation: "read-only";
  /** Correcting an existing fact is a separate audited command and may not be disguised as gap completion. */
  existingFactCorrection: "separate-audited-command";
  /** Correcting known facts requires an explicit mode; it is never opened alongside completion. */
  existingFactCorrectionPresentation: "explicit-mode";
  /** A real-world change creates a new lifecycle fact instead of rewriting the historical baseline. */
  businessChange: "new-lifecycle-fact";
  /** Missing paths that block only commands which require those exact facts. Supports `*` per path segment. */
  requiredFields: readonly string[];
  /** Baseline rows remain visible in ordinary reads even when quality fields are incomplete. */
  defaultQuery: "include-incomplete";
  /** Automation that requires an exact boundary must fail closed until that boundary is supplied. */
  exactBoundaryAutomation: "require-known-boundary";
  /** Only hard identity, ownership, parsing, FK or impossible-period conflicts are quarantined. */
  hardConflicts: "quarantine";
}

export type BusinessTemporalBaselineMutationKind = "supplement-missing" | "correct-existing";

export type BusinessTemporalBaselineMutationValidation =
  | { ok: true }
  | {
      ok: false;
      reason: "no-fields" | "mixed-semantics";
      conflictingFields: string[];
    };

/**
 * Keeps completion and correction mutually exclusive at the shared baseline seam.
 * Domain modules still own value validation and persistence, but cannot reinterpret
 * an existing fact as a missing-field supplement (or the reverse).
 */
export function validateBusinessTemporalBaselineMutation(input: {
  kind: BusinessTemporalBaselineMutationKind;
  missingFields: readonly string[];
  changedFields: readonly string[];
}): BusinessTemporalBaselineMutationValidation {
  const changedFields = [...new Set(input.changedFields)];
  if (changedFields.length === 0) {
    return { ok: false, reason: "no-fields", conflictingFields: [] };
  }
  const missing = new Set(input.missingFields);
  const conflictingFields = input.kind === "supplement-missing"
    ? changedFields.filter((field) => !missing.has(field))
    : changedFields.filter((field) => missing.has(field));
  return conflictingFields.length > 0
    ? { ok: false, reason: "mixed-semantics", conflictingFields }
    : { ok: true };
}

export function businessTemporalBaselineFieldRequired(
  policy: BusinessTemporalBaselinePolicy,
  fieldPath: string,
): boolean {
  const actual = fieldPath.split(".");
  return policy.requiredFields.some((pattern) => {
    const expected = pattern.split(".");
    return expected.length === actual.length
      && expected.every((segment, index) => segment === "*" || segment === actual[index]);
  });
}

export function businessTemporalBaselineMissingRequiredFields(
  policy: BusinessTemporalBaselinePolicy,
  missingFields: readonly string[],
): string[] {
  return missingFields.filter((field) => businessTemporalBaselineFieldRequired(policy, field));
}
