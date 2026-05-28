import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { matchEmployee, getInitials } from "@/lib/search";

interface RawContract {
  company?: unknown;
  isPrimary?: unknown;
  isInsuredHere?: unknown;
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

export function buildContractRows(
  employments: Array<{
    id: number;
    contracts: string | null;
    employee: { employeeId: string | null; name: string | null } | null;
  }>
): ContractRow[] {
  const rows: ContractRow[] = [];

  for (const emp of employments) {
    const list = parseContracts(emp.contracts);
    for (let i = 0; i < list.length; i++) {
      const c = list[i] as RawContract;
      rows.push({
        id: emp.id * 1000 + i,
        employmentId: emp.id,
        employeeId: emp.employee?.employeeId || "",
        employeeName: emp.employee?.name || "",
        company: String(c.company || ""),
        isPrimary: Boolean(c.isPrimary ?? false),
        isInsuredHere: Boolean(c.isInsuredHere ?? false),
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

  const rawContracts = parseContracts(emp.contracts);
  rawContracts.push(contractData);

  await prisma.employment.update({
    where: { id: emp.id },
    data: {
      contracts: JSON.stringify(rawContracts),
      editedBy: editorId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });

  return { success: true };
}
