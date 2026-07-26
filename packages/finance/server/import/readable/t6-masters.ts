import { join } from "node:path";
import { optionalText, readJsonLines, textValue } from "./read-jsonl";
import type {
  DimensionType,
  NormalizedAuxiliaryMember,
  NormalizedCashFlowItem,
  NormalizedCurrency,
} from "./types";

interface MemberDefinition {
  file: string;
  type: DimensionType;
  code: string[];
  name: string[];
  shortName?: string[];
  identity?: string[];
  contact?: string[];
  phone?: string[];
  address?: string[];
  bankName?: string[];
  bankAccount?: string[];
}

const MEMBER_DEFINITIONS: MemberDefinition[] = [
  {
    file: "Customer", type: "customer", code: ["cCusCode"], name: ["cCusName"],
    shortName: ["cCusAbbName"], identity: ["cCusRegCode"], contact: ["cCusLPerson", "cCusPerson"],
    phone: ["cCusPhone"], address: ["cCusAddress"], bankName: ["cCusBank"], bankAccount: ["cCusAccount"],
  },
  {
    file: "Vendor", type: "supplier", code: ["cVenCode"], name: ["cVenName"],
    shortName: ["cVenAbbName"], identity: ["cVenRegCode"], contact: ["cVenLPerson", "cVenPerson"],
    phone: ["cVenPhone"], address: ["cVenAddress"], bankName: ["cVenBank"], bankAccount: ["cVenAccount"],
  },
  {
    file: "Person", type: "person", code: ["cPersonCode"], name: ["cPersonName"],
    phone: ["cPersonPhone"],
  },
  {
    file: "Department", type: "department", code: ["cDepCode"], name: ["cDepName"],
    contact: ["cDepPerson"], phone: ["cDepPhone"], address: ["cDepAddress"],
  },
  {
    file: "fitemss97", type: "project", code: ["citemcode"], name: ["citemname"],
  },
];

function pick(row: Record<string, unknown>, keys?: string[]): string | undefined {
  return keys ? optionalText(row, ...keys) : undefined;
}

export async function loadT6Members(dataDir: string): Promise<NormalizedAuxiliaryMember[]> {
  const members: NormalizedAuxiliaryMember[] = [];
  for (const definition of MEMBER_DEFINITIONS) {
    const rows = await readJsonLines(join(dataDir, `${definition.file}.jsonl`));
    for (const row of rows) {
      const sourceCode = textValue(row, ...definition.code);
      const sourceName = textValue(row, ...definition.name);
      if (!sourceCode || !sourceName) continue;
      members.push({
        dimensionType: definition.type,
        sourceCode,
        sourceName,
        shortName: pick(row, definition.shortName),
        identityNumber: pick(row, definition.identity),
        contactPerson: pick(row, definition.contact),
        phone: pick(row, definition.phone),
        address: pick(row, definition.address),
        bankName: pick(row, definition.bankName),
        bankAccount: pick(row, definition.bankAccount),
      });
    }
  }
  return members;
}

export async function loadT6CashFlowItems(dataDir: string): Promise<NormalizedCashFlowItem[]> {
  return (await readJsonLines(join(dataDir, "fitemss98.jsonl"))).flatMap((row) => {
    const sourceCode = textValue(row, "citemcode");
    const sourceName = textValue(row, "citemname");
    if (!sourceCode || !sourceName) return [];
    return [{
      sourceCode,
      sourceName,
      direction: optionalText(row, "cDirection"),
    }];
  });
}

export async function loadT6Currencies(dataDir: string): Promise<NormalizedCurrency[]> {
  return (await readJsonLines(join(dataDir, "foreigncurrency.jsonl"))).flatMap((row) => {
    const sourceCode = textValue(row, "cexch_code");
    const sourceName = textValue(row, "cexch_name");
    if (!sourceCode || !sourceName) return [];
    return [{
      sourceCode,
      sourceName,
      decimalDigits: Number(optionalText(row, "idec") ?? 2),
      isBase: sourceCode === "RMB" || sourceName === "人民币",
    }];
  });
}
