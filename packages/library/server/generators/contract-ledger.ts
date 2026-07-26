import { generateAuthoritativeSource } from "./authoritative-source";

export function generateContractLedger(_input: Record<string, unknown>) {
  return generateAuthoritativeSource({
    ownerUnitId: "administration",
    sourceKey: "contract-ledger",
  });
}
