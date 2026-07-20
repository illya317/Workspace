export function resolveGroupedChoiceGroupSelection(value: string | null) {
  return value
    ? { kind: "group" as const, groupKey: value }
    : { kind: "clear" as const };
}
