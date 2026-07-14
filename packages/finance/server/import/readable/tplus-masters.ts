import { join } from "node:path";
import { booleanValue, numberValue, optionalText, readJsonLines, textValue } from "./read-jsonl";
import type {
  DimensionType, NormalizedAuxiliaryMember, NormalizedAuxiliaryRef,
  NormalizedCashFlowItem, NormalizedCurrency,
} from "./types";

export interface TPlusMasterIndex {
  memberCodes: Record<DimensionType, Map<number, string>>;
  currencyCodes: Map<number, string>;
  cashFlowCodes: Map<number, string>;
  accountTypeNames: Map<number, string>;
  docTypeCodes: Map<number, string>;
  members: NormalizedAuxiliaryMember[];
  currencies: NormalizedCurrency[];
  cashFlowItems: NormalizedCashFlowItem[];
}

const EMPTY_MEMBER_CODES = (): Record<DimensionType, Map<number, string>> => ({
  customer: new Map(), supplier: new Map(), person: new Map(), department: new Map(),
  project: new Map(), expense: new Map(),
});

function member(row: Record<string, unknown>, dimensionType: DimensionType): NormalizedAuxiliaryMember | null {
  const sourceCode = textValue(row, "code", "Code");
  const sourceName = textValue(row, "name", "Name");
  if (!sourceCode || !sourceName) return null;
  return {
    dimensionType, sourceCode, sourceName,
    shortName: optionalText(row, "partnerAbbName", "shorthand"),
    identityNumber: optionalText(row, "taxRegcode", "identityNo"),
    contactPerson: optionalText(row, "Contact", "representative"),
    phone: optionalText(row, "MobilePhone", "TelephoneNo", "mobilePhoneNo", "officePhoneNo"),
    address: optionalText(row, "CustomerAddress", "postAddr"),
    bankName: optionalText(row, "accbank"), bankAccount: optionalText(row, "bankAccount", "BankAccountNo"),
  };
}

function rowsToMembers(
  rows: Record<string, unknown>[],
  dimensionType: DimensionType,
  codeMap: Map<number, string>,
): NormalizedAuxiliaryMember[] {
  return rows.flatMap((row) => {
    const result = member(row, dimensionType);
    const id = numberValue(row, "id");
    if (!result || !id) return [];
    codeMap.set(id, result.sourceCode);
    return [result];
  });
}

export async function loadTPlusMasterIndex(dataDir: string): Promise<TPlusMasterIndex> {
  const [partners, departments, people, projects, expenses, currencyRows, cashRows, typeRows, docTypeRows] = await Promise.all([
    readJsonLines(join(dataDir, "AA_Partner.jsonl")), readJsonLines(join(dataDir, "AA_Department.jsonl")),
    readJsonLines(join(dataDir, "AA_Person.jsonl")), readJsonLines(join(dataDir, "AA_Project.jsonl")),
    readJsonLines(join(dataDir, "AA_ExpenseItem.jsonl")), readJsonLines(join(dataDir, "AA_Currency.jsonl")),
    readJsonLines(join(dataDir, "AA_CashFlowItem.jsonl")), readJsonLines(join(dataDir, "AA_AccountType.jsonl")),
    readJsonLines(join(dataDir, "AA_DocType.jsonl")),
  ]);
  const memberCodes = EMPTY_MEMBER_CODES();
  const partnerMap = new Map<number, string>();
  const partnerMembers = rowsToMembers(partners, "customer", partnerMap);
  memberCodes.customer = partnerMap;
  memberCodes.supplier = new Map(partnerMap);
  const supplierMembers = partnerMembers.map((item) => ({ ...item, dimensionType: "supplier" as const }));
  const members = [
    ...partnerMembers, ...supplierMembers,
    ...rowsToMembers(departments, "department", memberCodes.department),
    ...rowsToMembers(people, "person", memberCodes.person),
    ...rowsToMembers(projects, "project", memberCodes.project),
    ...rowsToMembers(expenses, "expense", memberCodes.expense),
  ];
  const currencyCodes = new Map<number, string>();
  const currencies = currencyRows.flatMap((row) => {
    const id = numberValue(row, "id");
    const sourceCode = textValue(row, "code");
    const sourceName = textValue(row, "name");
    if (!id || !sourceCode || !sourceName) return [];
    currencyCodes.set(id, sourceCode);
    return [{
      sourceCode, sourceName, symbol: optionalText(row, "currencySign"),
      isBase: booleanValue(row, "isNative") || sourceCode === "RMB",
    }];
  });
  const cashFlowCodes = new Map<number, string>();
  const cashFlowItems = cashRows.flatMap((row) => {
    const id = numberValue(row, "id");
    const sourceCode = textValue(row, "code");
    const sourceName = textValue(row, "name");
    if (!id || !sourceCode || !sourceName) return [];
    cashFlowCodes.set(id, sourceCode);
    return [{ sourceCode, sourceName, direction: numberValue(row, "direction") === 477 ? "inflow" : "outflow" }];
  });
  return {
    memberCodes, currencyCodes, cashFlowCodes, members, currencies, cashFlowItems,
    accountTypeNames: new Map(typeRows.map((row) => [numberValue(row, "id"), textValue(row, "name")])),
    docTypeCodes: new Map(docTypeRows.map((row) => [numberValue(row, "id"), textValue(row, "code")])),
  };
}

export function tplusAuxiliaryRefs(row: Record<string, unknown>, index: TPlusMasterIndex): NormalizedAuxiliaryRef[] {
  const definitions: Array<[string, DimensionType, string]> = [
    ["idauxAccCustomer", "customer", "customer"], ["idauxAccSupplier", "supplier", "supplier"],
    ["idauxAccPerson", "person", "person"], ["idauxAccDepartment", "department", "department"],
    ["idauxAccProject", "project", "project"],
  ];
  return definitions.flatMap(([field, dimensionType, sourceRole]) => {
    const id = numberValue(row, field);
    const sourceCode = index.memberCodes[dimensionType].get(id);
    return sourceCode ? [{ dimensionType, sourceCode, sourceRole }] : [];
  });
}
