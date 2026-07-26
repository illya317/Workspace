export type AuxiliaryReclassSide = "debit" | "credit";

export interface AuxiliaryReclassPair {
  abnormalSide: AuxiliaryReclassSide;
  target: string;
}

export const AUXILIARY_RECLASS_PAIRS: Readonly<Record<string, AuxiliaryReclassPair>> = {
  "1122": { abnormalSide: "credit", target: "2203" },
  "2203": { abnormalSide: "debit", target: "1122" },
  "1123": { abnormalSide: "credit", target: "2202" },
  "2202": { abnormalSide: "debit", target: "1123" },
  "1221": { abnormalSide: "credit", target: "2241" },
  "122101": { abnormalSide: "credit", target: "224101" },
  "122102": { abnormalSide: "credit", target: "224102" },
  "2241": { abnormalSide: "debit", target: "1221" },
  "224101": { abnormalSide: "debit", target: "122101" },
  "224102": { abnormalSide: "debit", target: "122102" },
  "2221": { abnormalSide: "debit", target: "1463" },
};

const AUXILIARY_RECLASS_PREFIXES = Object.keys(AUXILIARY_RECLASS_PAIRS)
  .sort((left, right) => right.length - left.length);

export function resolveAuxiliaryReclassPair(accountCode: string): AuxiliaryReclassPair | null {
  const prefix = AUXILIARY_RECLASS_PREFIXES.find((candidate) => accountCode.startsWith(candidate));
  return prefix ? AUXILIARY_RECLASS_PAIRS[prefix] ?? null : null;
}
