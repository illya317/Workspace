import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { isValidCompanyName, isValidDateValue, validateContractOption } from "../field-validation";
import {
  ALLOWED_CONTRACT_FIELDS,
  CONTRACT_DATE_FIELDS,
  normalizeContractRecord,
} from "../contract-records";

const CONTRACT_OPTION_FIELDS = ["legalRelation", "contractType", "employmentForm", "insuranceStatus"];
const PROFILE_CONTRACT_FIELDS = [
  "company",
  "isPrimary",
  "insuranceStatus",
  "legalRelation",
  "contractType",
  "employmentForm",
  ...CONTRACT_DATE_FIELDS,
] as const;

export interface ContractCreateCommand {
  employeeId: unknown;
  contract: Record<string, unknown>;
}

export interface ContractFieldUpdateCommand {
  field: string;
  value: unknown;
}

export interface EmployeeProfileContractsCommand {
  employments: Array<{ id: number }>;
  grouped: Map<number, Record<string, unknown>[]>;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

async function validateContractValues(contractData: Record<string, unknown>) {
  for (const field of CONTRACT_DATE_FIELDS) {
    if (!isValidDateValue(contractData[field])) return "日期格式无效";
  }
  if (!(await isValidCompanyName(contractData.company))) return "公司不存在";
  for (const field of CONTRACT_OPTION_FIELDS) {
    if (!validateContractOption(field, contractData[field])) return "字段值不在允许范围内";
  }
  return null;
}

async function normalizeProfileContractRow(row: Record<string, unknown>, fallbackEmploymentId: number) {
  const employmentId = nullableNumber(row.employmentId) ?? fallbackEmploymentId;
  if (Number.isNaN(employmentId)) return null;
  const error = await validateContractValues(row);
  if (error) return null;

  const contract: Record<string, unknown> = {};
  for (const field of PROFILE_CONTRACT_FIELDS) {
    contract[field] = field === "isPrimary" ? Boolean(row[field]) : nullableString(row[field]);
  }
  return { employmentId, contract: normalizeContractRecord(contract) };
}

export async function buildContractCreateCommand(
  employeeId: unknown,
  contractData: Record<string, unknown>,
): Promise<DomainValidationResult<ContractCreateCommand>> {
  const error = await validateContractValues(contractData);
  if (error) return failCommand(error);
  return okCommand({ employeeId, contract: normalizeContractRecord(contractData) });
}

export async function buildContractFieldUpdateCommand(
  field: string,
  value: unknown,
): Promise<DomainValidationResult<ContractFieldUpdateCommand>> {
  if (!ALLOWED_CONTRACT_FIELDS.includes(field)) return failCommand("非法字段");
  const error = await validateContractValues({ [field]: value });
  if (error) return failCommand(error);
  return okCommand({ field, value });
}

export function buildContractDeleteCommand(contractId: unknown): DomainValidationResult<{ contractId: number }> {
  const id = Number(contractId);
  if (!Number.isInteger(id) || id <= 0) return failCommand("合同ID无效");
  return okCommand({ contractId: id });
}

export async function buildEmployeeProfileContractsCommand(
  employeeId: number,
  rows: unknown,
): Promise<DomainValidationResult<EmployeeProfileContractsCommand>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return failCommand("员工ID无效");
  if (!Array.isArray(rows)) return failCommand("请求体无效");

  const employments = await prisma.employment.findMany({
    where: { employeeId },
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (employments.length === 0) return failCommand("该员工无雇佣记录", 404);

  const employmentIds = new Set(employments.map((row) => row.id));
  const fallbackEmploymentId = employments[0].id;
  const grouped = new Map<number, Record<string, unknown>[]>();
  let primarySeen = false;

  for (const row of rows) {
    const normalized = await normalizeProfileContractRow(row as Record<string, unknown>, fallbackEmploymentId);
    if (!normalized) return failCommand("合同记录校验失败");
    if (!employmentIds.has(normalized.employmentId)) return failCommand("合同记录不属于该员工");
    if (normalized.contract.isPrimary === true) {
      if (primarySeen) normalized.contract.isPrimary = false;
      primarySeen = true;
    }
    const list = grouped.get(normalized.employmentId) ?? [];
    list.push(normalized.contract);
    grouped.set(normalized.employmentId, list);
  }

  return okCommand({ employments, grouped });
}
