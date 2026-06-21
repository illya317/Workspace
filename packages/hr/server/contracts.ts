import { prisma } from "@workspace/platform/server/prisma";
import { Prisma } from "@workspace/platform/server/prisma";
import { snapshotHistory } from "@workspace/platform/server/history";
import { isValidCompanyName, isValidDateValue, validateContractOption } from "./field-validation";
import {
  ALLOWED_CONTRACT_FIELDS,
  CONTRACT_DATE_FIELDS,
  buildContractRows,
  clearPrimaryContractFlags,
  filterContracts,
  normalizeContractRecord,
  paginateContracts,
  parseContracts,
  type PaginatedContracts,
} from "./contract-records";
export {
  buildContractRows,
  clearPrimaryContractFlags,
  filterContracts,
  normalizeContractRecord,
  paginateContracts,
  parseContracts,
};
export type { ContractRow, PaginatedContracts } from "./contract-records";

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

export async function createEmployeeContract(input: {
  employeeId: unknown;
  contractData: Record<string, unknown>;
  editorId: number;
}) {
  for (const field of CONTRACT_DATE_FIELDS) {
    if (!isValidDateValue(input.contractData[field])) {
      return { success: false, error: "日期格式无效", status: 400 };
    }
  }
  if (!(await isValidCompanyName(input.contractData.company))) {
    return { success: false, error: "公司不存在", status: 400 };
  }
  for (const field of ["legalRelation", "contractType", "employmentForm", "insuranceStatus"]) {
    if (!validateContractOption(field, input.contractData[field])) {
      return { success: false, error: "字段值不在允许范围内", status: 400 };
    }
  }

  return addContract(input.employeeId, input.contractData, input.editorId);
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
  if (CONTRACT_DATE_FIELDS.includes(field) && !isValidDateValue(value)) {
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
