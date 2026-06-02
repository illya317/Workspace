export interface MappingResolveResult {
  accountCode: string;
  explicitLineCode: string | null;
  resolvedLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  ancestorAccountCode: string | null;
  effectiveOperator: "add" | "subtract" | "exclude" | null;
}
