import { generateAuthoritativeSource } from "./authoritative-source";

export function generateDueDiligenceRoster(_input: Record<string, unknown>) {
  return generateAuthoritativeSource({
    ownerUnitId: "hr",
    sourceKey: "roster-due-diligence",
  });
}
