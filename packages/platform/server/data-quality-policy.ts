import "server-only";

import { getTenantProfile } from "./tenant-config";

export const DATA_QUALITY_AUTOMATION = {
  dailyAt: "08:30",
  mutationTriggerEnabled: true,
} as const;

export type DataQualityPolicy = {
  schedule: { enabled: true; dailyAt: string; timeZone: string };
  mutationTrigger: { enabled: true };
};

export async function getDataQualityPolicy(): Promise<DataQualityPolicy> {
  return {
    schedule: {
      enabled: true,
      dailyAt: DATA_QUALITY_AUTOMATION.dailyAt,
      timeZone: getTenantProfile().localization.businessTimeZone,
    },
    mutationTrigger: { enabled: DATA_QUALITY_AUTOMATION.mutationTriggerEnabled },
  };
}
