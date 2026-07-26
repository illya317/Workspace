import { generateAuthoritativeSource } from "./authoritative-source";
import type { GeneratorOutput } from "./types";

export async function generateFinanceReport(_input: Record<string, unknown>): Promise<GeneratorOutput[]> {
  return generateAuthoritativeSource({
    ownerUnitId: "finance",
    sourceKey: "finance-report",
  });
}
