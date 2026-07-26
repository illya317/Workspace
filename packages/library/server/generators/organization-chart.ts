import { generateAuthoritativeSource } from "./authoritative-source";

export function generateOrganizationChart(_input: Record<string, unknown>) {
  return generateAuthoritativeSource({
    ownerUnitId: "hr",
    sourceKey: "organization-chart",
  });
}
