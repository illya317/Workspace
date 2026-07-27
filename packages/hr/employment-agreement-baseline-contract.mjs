export const EMPLOYMENT_AGREEMENT_BASELINE_REQUIRED_FIELDS = [
  "terms.*.effectiveFrom",
];

export const EMPLOYMENT_AGREEMENT_BASELINE_TRACKED_FIELDS = [
  "content.company",
  "content.legalRelation",
  "content.contractType",
  "content.employmentForm",
  "terms.*.effectiveFrom",
  "terms.*.effectiveThrough",
];

export function employmentAgreementBaselineFieldRequired(fieldPath) {
  return matchesAnyFieldPattern(EMPLOYMENT_AGREEMENT_BASELINE_REQUIRED_FIELDS, fieldPath);
}

export function employmentAgreementBaselineMissingFields(content, terms) {
  const missingFields = [];
  for (const field of EMPLOYMENT_AGREEMENT_BASELINE_TRACKED_FIELDS) {
    if (!field.startsWith("content.")) continue;
    const key = field.slice("content.".length);
    if (content[key] == null || content[key] === "") missingFields.push(field);
  }
  for (const term of terms) {
    const fieldValues = {
      [`terms.${term.sequence}.effectiveFrom`]: term.effectiveFrom,
      [`terms.${term.sequence}.effectiveThrough`]: term.termKind === "permanent" ? "open" : term.effectiveThrough,
    };
    for (const [fieldPath, value] of Object.entries(fieldValues)) {
      if (!value && matchesAnyFieldPattern(EMPLOYMENT_AGREEMENT_BASELINE_TRACKED_FIELDS, fieldPath)) {
        missingFields.push(fieldPath);
      }
    }
  }
  return missingFields.sort();
}

function matchesAnyFieldPattern(patterns, fieldPath) {
  const actual = fieldPath.split(".");
  return patterns.some((pattern) => {
    const expected = pattern.split(".");
    return expected.length === actual.length
      && expected.every((segment, index) => segment === "*" || segment === actual[index]);
  });
}
