import "server-only";

import type { DataQualitySeverity } from "@workspace/platform/data-quality-contract";
import { listDataQualityProviderResourceKeys } from "@workspace/platform/data-quality-provider-registry";
import { registeredModuleDefinitions } from "../module-registry";
import { portalEntriesFromModules } from "../portal-preferences";
import { DATA_QUALITY_AUTOMATION } from "./notification-data-quality";
import { getTenantProfile } from "./tenant-config";

export type DataQualityPolicy = {
  schedule: { enabled: true; dailyAt: string; timeZone: string };
  mutationTrigger: { enabled: true };
  notifications: {
    minimumSeverity: DataQualitySeverity;
    repeatAfterHours: number;
    workspace: { enabled: true };
  };
};

export async function getDataQualityPolicy(): Promise<DataQualityPolicy> {
  return {
    schedule: {
      enabled: true,
      dailyAt: DATA_QUALITY_AUTOMATION.dailyAt,
      timeZone: getTenantProfile().localization.businessTimeZone,
    },
    mutationTrigger: { enabled: true },
    notifications: {
      minimumSeverity: DATA_QUALITY_AUTOMATION.minimumSeverity,
      repeatAfterHours: DATA_QUALITY_AUTOMATION.repeatAfterHours,
      workspace: { enabled: true },
    },
  };
}

export function listDataQualityRoutingResourceOptions() {
  const producerResourceKeys = new Set<string>(listDataQualityProviderResourceKeys());
  const modules = registeredModuleDefinitions.flatMap((definition) => definition.moduleDef ? [definition.moduleDef] : []);
  return portalEntriesFromModules(modules).flatMap((entry) => (
    entry.level === 2 && entry.resourceKey && producerResourceKeys.has(entry.resourceKey) && entry.parentKey && entry.parentLabel
      ? [{
          value: entry.resourceKey,
          label: `${entry.parentLabel} / ${entry.label}`,
          l1Value: entry.parentKey,
          l1Label: entry.parentLabel,
          l2Label: entry.label,
        }]
      : []
  ));
}

const severityRank: Record<DataQualitySeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function dataQualitySeverityMeetsThreshold(
  severity: DataQualitySeverity,
  minimumSeverity: DataQualitySeverity,
) {
  return severityRank[severity] >= severityRank[minimumSeverity];
}

export function dataQualitySeverityIncreased(previous: string, current: DataQualitySeverity) {
  return severityRank[current] > (severityRank[previous as DataQualitySeverity] ?? -1);
}
