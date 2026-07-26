export function strictIntegerArray(value: unknown) {
  if (!Array.isArray(value)) return { valid: false as const, items: [] };
  const items = value.filter((item): item is number => (
    typeof item === "number" && Number.isInteger(item) && item > 0
  ));
  return items.length === value.length
    ? { valid: true as const, items }
    : { valid: false as const, items: [] };
}

export function employeeLifecycleEventState(
  effectiveDate: string,
  details: Record<string, unknown>,
  cancelledAssignmentIds: ReadonlySet<number>,
  businessDate: string,
) {
  const temporalState = effectiveDate <= businessDate
    ? "effective" as const
    : "scheduled" as const;
  const createdAssignmentIds = strictIntegerArray(details.createdAssignmentIds);
  if (!createdAssignmentIds.valid) {
    return {
      temporalState,
      recordState: "unknown" as const,
      recordStateProvenance: "unknown" as const,
    };
  }
  const cancelled = createdAssignmentIds.items.length > 0
    && createdAssignmentIds.items.every((id) => cancelledAssignmentIds.has(id));
  return cancelled
    ? {
        temporalState,
        recordState: "cancelled" as const,
        recordStateProvenance: "legacy_inferred" as const,
      }
    : {
        temporalState,
        recordState: "confirmed" as const,
        recordStateProvenance: "explicit" as const,
      };
}
