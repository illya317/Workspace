export function financeAccountSourceScopeKey(input: {
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceLedger: string | null;
}) {
  return [input.sourceSystem ?? "workspace", input.sourceLedger ?? input.sourceDatabase ?? "default"]
    .map((part) => encodeURIComponent(part))
    .join("::");
}

export function financeGroupMappingKey(companyCode: string, sourceScopeKey: string, localAccountCode: string) {
  return `${companyCode}\u001f${sourceScopeKey}\u001f${localAccountCode}`;
}

export function financeGroupScopedLocalKey(sourceScopeKey: string, localAccountCode: string) {
  return `${sourceScopeKey}\u001f${localAccountCode}`;
}
