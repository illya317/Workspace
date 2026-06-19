import { prisma } from "@workspace/platform/server/prisma";
import { Prisma } from "@workspace/platform/server/prisma";
import { getInitials } from "@workspace/core/search";
import { matchEmployee } from "./search";
import { snapshotHistory } from "@workspace/platform/server/history";
import { isValidCompanyName, isValidDateValue, validateContractOption } from "./field-validation";

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

export function clearPrimaryContractFlags(
  contracts: Record<string, unknown>[],
  keepIndex?: number,
) {
  let changed = false;
  const next = contracts.map((contract, index) => {
    if (index === keepIndex) return contract;
    if (contract.isPrimary !== true) return contract;
    changed = true;
    return { ...contract, isPrimary: false };
  });
  return { contracts: next, changed };
}

function normalizedString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function normalizeContractRecord(contract: Record<string, unknown>) {
  const next = { ...contract };
  if (!next.insuranceStatus && typeof next.isInsuredHere === "boolean") {
    next.insuranceStatus = next.isInsuredHere ? "已参保" : "未参保";
  }
  delete next.isInsuredHere;
  const endDate = normalizedString(next.endDate);
  const permanentContractDate = normalizedString(next.permanentContractDate);
  const periodEndDates = [
    normalizedString(next.firstContractEndDate),
    normalizedString(next.secondContractEndDate),
    normalizedString(next.thirdContractEndDate),
  ].filter(Boolean);

  if (endDate && (permanentContractDate || periodEndDates.includes(endDate))) {
    next.endDate = null;
  }

  return next;
}

export async function clearPrimaryContractsForEmployee(
  employeeId: number,
  editorId: number,
  exceptEmploymentId?: number,
) {
  const employments = await prisma.employment.findMany({
    where: { employeeId, id: exceptEmploymentId ? { not: exceptEmploymentId } : undefined },
    select: { id: true, contracts: true },
  });

  for (const employment of employments) {
    const parsed = parseContracts(employment.contracts).map(normalizeContractRecord);
    const result = clearPrimaryContractFlags(parsed);
    if (!result.changed) continue;
    await prisma.employment.update({
      where: { id: employment.id },
      data: {
        contracts: JSON.stringify(result.contracts),
        editedBy: editorId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await snapshotHistory("Employment", employment.id, editorId);
  }
}

export function buildContractRows(
  employments: Array<{
    id: number;
    contracts: string | null;
    employee: { employeeId: string | null; name: string | null } | null;
  }>
): ContractRow[] {
  const rows: ContractRow[] = [];

  for (const emp of employments) {
    const list = parseContracts(emp.contracts).map(normalizeContractRecord);
    for (let i = 0; i < list.length; i++) {
      const c = list[i] as RawContract;
      rows.push({
        id: emp.id * 1000 + i,
        employmentId: emp.id,
        employeeId: emp.employee?.employeeId || "",
        employeeName: emp.employee?.name || "",
        company: String(c.company || ""),
        isPrimary: Boolean(c.isPrimary ?? false),
        isInsuredHere: c.insuranceStatus === "已参保",
        insuranceStatus: c.insuranceStatus == null ? null : String(c.insuranceStatus),
        legalRelation: String(c.legalRelation || ""),
        contractType: String(c.contractType || ""),
        employmentForm: String(c.employmentForm || ""),
        firstContractStartDate: c.firstContractStartDate == null ? null : String(c.firstContractStartDate),
        firstContractEndDate: c.firstContractEndDate == null ? null : String(c.firstContractEndDate),
        secondContractStartDate: c.secondContractStartDate == null ? null : String(c.secondContractStartDate),
        secondContractEndDate: c.secondContractEndDate == null ? null : String(c.secondContractEndDate),
        thirdContractStartDate: c.thirdContractStartDate == null ? null : String(c.thirdContractStartDate),
        thirdContractEndDate: c.thirdContractEndDate == null ? null : String(c.thirdContractEndDate),
        permanentContractDate: c.permanentContractDate == null ? null : String(c.permanentContractDate),
        confidentialityDate: c.confidentialityDate == null ? null : String(c.confidentialityDate),
        nonCompeteDate: c.nonCompeteDate == null ? null : String(c.nonCompeteDate),
        endDate: c.endDate == null ? null : String(c.endDate),
      });
    }
  }

  return rows;
}

const SEARCH_FIELDS = ["company", "legalRelation", "contractType", "employmentForm"];

const DATE_FIELDS = [
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

const ALLOWED_CONTRACT_FIELDS = [
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

export function filterContracts(rows: ContractRow[], keyword: string): ContractRow[] {
  const query = keyword.toLowerCase();

  return rows.filter((c) => {
    if (matchEmployee({ name: c.employeeName, employeeId: c.employeeId }, keyword)) return true;

    for (const f of SEARCH_FIELDS) {
      const val = String((c as unknown as Record<string, unknown>)[f] || "").toLowerCase();
      if (val.includes(query)) return true;
      if (getInitials(String((c as unknown as Record<string, unknown>)[f] || "")).includes(query)) return true;
    }

    for (const f of DATE_FIELDS) {
      if (String((c as unknown as Record<string, unknown>)[f] || "").toLowerCase().includes(query)) return true;
    }

    return false;
  });
}

export interface PaginatedContracts {
  contracts: ContractRow[];
  total: number;
}

export function paginateContracts(
  rows: ContractRow[],
  page: number,
  pageSize: number
): PaginatedContracts {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { contracts: rows.slice(start, start + pageSize), total };
}

export async function getContracts(options: {
  company?: string;
  keyword?: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedContracts> {
  const where: Prisma.EmploymentWhereInput = { isActive: true };
  if (options.company) where.currentCompany = options.company;

  const employments = await prisma.employment.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
    },
    orderBy: { id: "asc" },
  });

  let rows = buildContractRows(
    employments.map((e) => ({
      id: e.id,
      contracts: e.contracts,
      employee: e.employee,
    }))
  );

  if (options.keyword) {
    rows = filterContracts(rows, options.keyword);
  }

  return paginateContracts(rows, options.page, options.pageSize);
}

export async function addContract(
  employeeId: unknown,
  contractData: Record<string, unknown>,
  editorId: number
) {
  const emp = await prisma.employment.findFirst({
    where: { employeeId: Number(employeeId) },
    orderBy: { id: "desc" },
  });

  if (!emp) {
    return { success: false, error: "该员工无雇佣记录", status: 404 };
  }

  const rawContracts = parseContracts(emp.contracts).map(normalizeContractRecord);
  if (contractData.isPrimary === true) {
    const result = clearPrimaryContractFlags(rawContracts);
    rawContracts.splice(0, rawContracts.length, ...result.contracts);
    await clearPrimaryContractsForEmployee(emp.employeeId, editorId, emp.id);
  }
  rawContracts.push(normalizeContractRecord(contractData));

  await prisma.employment.update({
    where: { id: emp.id },
    data: {
      contracts: JSON.stringify(rawContracts),
      editedBy: editorId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await snapshotHistory("Employment", emp.id, editorId);

  return { success: true };
}

function decodeSyntheticContractId(contractId: number) {
  return {
    employmentId: Math.floor(contractId / 1000),
    index: contractId % 1000,
  };
}

async function loadSyntheticContract(contractId: number) {
  const { employmentId, index } = decodeSyntheticContractId(contractId);
  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment || !employment.contracts) return { ok: false as const, error: "合同不存在", status: 404 };

  let contracts: Record<string, unknown>[];
  try {
    contracts = JSON.parse(employment.contracts) as Record<string, unknown>[];
  } catch {
    return { ok: false as const, error: "合同数据异常", status: 500 };
  }
  if (!Array.isArray(contracts) || index >= contracts.length) {
    return { ok: false as const, error: "合同不存在", status: 404 };
  }

  return { ok: true as const, employment, employmentId, index, contracts };
}

export async function updateContractField(
  contractId: number,
  field: string,
  value: unknown,
  userId: number,
) {
  if (!ALLOWED_CONTRACT_FIELDS.includes(field)) return { ok: false as const, error: "非法字段", status: 400 };
  if (DATE_FIELDS.includes(field) && !isValidDateValue(value)) {
    return { ok: false as const, error: "日期格式无效", status: 400 };
  }
  if (field === "company" && !(await isValidCompanyName(value))) {
    return { ok: false as const, error: "公司不存在", status: 400 };
  }
  if (!validateContractOption(field, value)) {
    return { ok: false as const, error: "字段值不在允许范围内", status: 400 };
  }

  const loaded = await loadSyntheticContract(contractId);
  if (!loaded.ok) return loaded;

  let contracts = loaded.contracts;
  contracts[loaded.index][field] = value ?? null;
  contracts[loaded.index] = normalizeContractRecord(contracts[loaded.index]);
  if (field === "isPrimary" && value === true) {
    const result = clearPrimaryContractFlags(contracts, loaded.index);
    contracts = result.contracts.map(normalizeContractRecord);
    await clearPrimaryContractsForEmployee(loaded.employment.employeeId, userId, loaded.employmentId);
  }

  await prisma.employment.update({
    where: { id: loaded.employmentId },
    data: { contracts: JSON.stringify(contracts), editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Employment", loaded.employmentId, userId);

  return { ok: true as const, data: { success: true } };
}

export async function deleteContract(contractId: number, userId: number) {
  const loaded = await loadSyntheticContract(contractId);
  if (!loaded.ok) return loaded;

  loaded.contracts.splice(loaded.index, 1);
  await prisma.employment.update({
    where: { id: loaded.employmentId },
    data: { contracts: JSON.stringify(loaded.contracts), editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Employment", loaded.employmentId, userId);

  return { ok: true as const, data: { success: true } };
}
