export interface DataQualityProviderRegistration {
  key: string;
  domain: string;
  unitId: string;
  resourceKeys: readonly string[];
}

export const DATA_QUALITY_PROVIDER_REGISTRATIONS = [
  {
    key: "hr",
    domain: "hr",
    unitId: "hr",
    resourceKeys: ["hr.roster"],
  },
] as const satisfies readonly DataQualityProviderRegistration[];

export function listDataQualityProviderRegistrations() {
  return [...DATA_QUALITY_PROVIDER_REGISTRATIONS];
}

export function listDataQualityProviderResourceKeys() {
  return [...new Set(DATA_QUALITY_PROVIDER_REGISTRATIONS.flatMap((provider) => provider.resourceKeys))];
}
