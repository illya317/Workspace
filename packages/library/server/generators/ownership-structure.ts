import { generateAuthoritativeSource } from "./authoritative-source";

export function generateOwnershipStructure(_input: Record<string, unknown>) {
  return generateAuthoritativeSource({
    ownerUnitId: "capital-securities",
    routeModuleKey: "capitalSecurities",
    sourceKey: "ownership-structure",
  });
}
