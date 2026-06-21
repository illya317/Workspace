import { getInitials } from "@workspace/core/search";
import { matchEmployee } from "@workspace/platform/search";

interface RawContract {
  company?: unknown;
  isPrimary?: unknown;
  isInsuredHere?: unknown;
  insuranceStatus?: unknown;
  legalRelation?: unknown;
  contractType?: unknown;
  employmentForm?: unknown;
  firstContractStartDate?: unknown;
  firstContractEndDate?: unknown;
  secondContractStartDate?: unknown;
  secondContractEndDate?: unknown;
  thirdContractStartDate?: unknown;
  thirdContractEndDate?: unknown;
  permanentContractDate?: unknown;
  confidentialityDate?: unknown;
  nonCompeteDate?: unknown;
  endDate?: unknown;
}

export interface ContractRow {
  id: number;
  employmentId: number;
  employeeId: string;
  employeeName: string;
  company: string;
  isPrimary: boolean;
  isInsuredHere: boolean;
  insuranceStatus: string | null;
  legalRelation: string;
  contractType: string;
  employmentForm: string;
  firstContractStartDate: string | null;
  firstContractEndDate: string | null;
  secondContractStartDate: string | null;
  secondContractEndDate: string | null;
  thirdContractStartDate: string | null;
  thirdContractEndDate: string | null;
  permanentContractDate: string | null;
  confidentialityDate: string | null;
  nonCompeteDate: string | null;
  endDate: string | null;
}

export interface PaginatedContracts {
  contracts: ContractRow[];
  total: number;
}

const SEARCH_FIELDS = ["company", "legalRelation", "contractType", "employmentForm"];
export const CONTRACT_DATE_FIELDS = [
  "firstContractStartDate",
  "firstContractEndDate",
  "secondContractStartDate",
  "secondContractEndDate",
  "thirdContractStartDate",
  "thirdContractEndDate",
  "permanentContractDate",
  "confidentialityDate",
  "nonCompeteDate",
  "endDate",
];

export const ALLOWED_CONTRACT_FIELDS = [
  "company",
  "isPrimary",
  "isInsuredHere",
  "insuranceStatus",
  "legalRelation",
  "contractType",
  "employmentForm",
  "firstContractStartDate",
  "firstContractEndDate",
  "secondContractStartDate",
  "secondContractEndDate",
  "thirdContractStartDate",
  "thirdContractEndDate",
  "permanentContractDate",
  "confidentialityDate",
  "nonCompeteDate",
  "endDate",
];

export function parseContracts(json: string | null): Record<string, unknown>[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    return [parsed as Record<string, unknown>];
  } catch {
    return [];
  }
}

export function clearPrimaryContractFlags(contracts: Record<string, unknown>[], keepIndex?: number) {
  let changed = false;
  const next = contracts.map((contract, index) => {
    if (index === keepIndex || contract.isPrimary !== true) return contract;
    changed = true;
    return { ...contract, isPrimary: false };
  });
  return { contracts: next, changed };
}

export function normalizeContractRecord(contract: Record<string, unknown>) {
  const next = { ...contract };
  if (!next.insuranceStatus && typeof next.isInsuredHere === "boolean") next.insuranceStatus = next.isInsuredHere ? "已参保" : "未参保";
  delete next.isInsuredHere;
  const endDate = normalizedString(next.endDate);
  const permanentContractDate = normalizedString(next.permanentContractDate);
  const periodEndDates = [
    normalizedString(next.firstContractEndDate),
    normalizedString(next.secondContractEndDate),
    normalizedString(next.thirdContractEndDate),
  ].filter(Boolean);
  if (endDate && (permanentContractDate || periodEndDates.includes(endDate))) next.endDate = null;
  return next;
}

export function buildContractRows(employments: Array<{
  id: number;
  contracts: string | null;
  employee: { employeeId: string | null; name: string | null } | null;
}>): ContractRow[] {
  const rows: ContractRow[] = [];
  for (const emp of employments) {
    const list = parseContracts(emp.contracts).map(normalizeContractRecord);
    for (let i = 0; i < list.length; i++) rows.push(contractRowFromRaw(emp, list[i] as RawContract, i));
  }
  return rows;
}

export function filterContracts(rows: ContractRow[], keyword: string): ContractRow[] {
  const query = keyword.toLowerCase();
  return rows.filter((contract) => {
    if (matchEmployee({ name: contract.employeeName, employeeId: contract.employeeId }, keyword)) return true;
    for (const field of SEARCH_FIELDS) {
      const value = String((contract as unknown as Record<string, unknown>)[field] || "").toLowerCase();
      if (value.includes(query) || getInitials(value).includes(query)) return true;
    }
    return CONTRACT_DATE_FIELDS.some((field) => String((contract as unknown as Record<string, unknown>)[field] || "").toLowerCase().includes(query));
  });
}

export function paginateContracts(rows: ContractRow[], page: number, pageSize: number): PaginatedContracts {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { contracts: rows.slice(start, start + pageSize), total };
}

function normalizedString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function contractRowFromRaw(
  employment: { id: number; employee: { employeeId: string | null; name: string | null } | null },
  contract: RawContract,
  index: number,
): ContractRow {
  return {
    id: employment.id * 1000 + index,
    employmentId: employment.id,
    employeeId: employment.employee?.employeeId || "",
    employeeName: employment.employee?.name || "",
    company: String(contract.company || ""),
    isPrimary: Boolean(contract.isPrimary ?? false),
    isInsuredHere: contract.insuranceStatus === "已参保",
    insuranceStatus: contract.insuranceStatus == null ? null : String(contract.insuranceStatus),
    legalRelation: String(contract.legalRelation || ""),
    contractType: String(contract.contractType || ""),
    employmentForm: String(contract.employmentForm || ""),
    firstContractStartDate: contract.firstContractStartDate == null ? null : String(contract.firstContractStartDate),
    firstContractEndDate: contract.firstContractEndDate == null ? null : String(contract.firstContractEndDate),
    secondContractStartDate: contract.secondContractStartDate == null ? null : String(contract.secondContractStartDate),
    secondContractEndDate: contract.secondContractEndDate == null ? null : String(contract.secondContractEndDate),
    thirdContractStartDate: contract.thirdContractStartDate == null ? null : String(contract.thirdContractStartDate),
    thirdContractEndDate: contract.thirdContractEndDate == null ? null : String(contract.thirdContractEndDate),
    permanentContractDate: contract.permanentContractDate == null ? null : String(contract.permanentContractDate),
    confidentialityDate: contract.confidentialityDate == null ? null : String(contract.confidentialityDate),
    nonCompeteDate: contract.nonCompeteDate == null ? null : String(contract.nonCompeteDate),
    endDate: contract.endDate == null ? null : String(contract.endDate),
  };
}
