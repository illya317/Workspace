import type { DataQualityFinding } from "./data-quality-contract";

export type DataQualityNotificationGroup = {
  resourceKey: string | null;
  departmentId: number | null;
  findings: DataQualityFinding[];
};

/** Groups findings by the permission scope used for subscriber eligibility and delivery. */
export function buildDataQualityNotificationGroups(
  findings: DataQualityFinding[],
): DataQualityNotificationGroup[] {
  const groups = new Map<string, DataQualityNotificationGroup>();
  for (const finding of findings) {
    const resourceKey = finding.resourceKey ?? null;
    const departmentId = finding.departmentId ?? null;
    const groupKey = `${resourceKey ?? "unscoped"}:${departmentId ?? "unscoped"}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.findings.push(finding);
      continue;
    }
    groups.set(groupKey, { resourceKey, departmentId, findings: [finding] });
  }
  return [...groups.values()];
}
