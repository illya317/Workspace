import { snapshotHistory } from "@workspace/platform/server/history";
import { isValidCompanyName, isValidDateValue, validateContractOption } from "./field-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { normalizeContractRecord } from "./contracts";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };
type ContractBodyRow = Record<string, unknown>;

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

const CONTRACT_FIELDS = [
  "company",
  "isPrimary",
  "insuranceStatus",
  "legalRelation",
  "contractType",
  "employmentForm",
  ...DATE_FIELDS,
] as const;

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

async function normalizeContractRow(row: ContractBodyRow, fallbackEmploymentId: number) {
  const employmentId = nullableNumber(row.employmentId) ?? fallbackEmploymentId;
  if (Number.isNaN(employmentId)) return null;

  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(row[field])) return null;
  }
  if (!(await isValidCompanyName(row.company))) return null;
  for (const field of ["legalRelation", "contractType", "employmentForm", "insuranceStatus"]) {
    if (!validateContractOption(field, row[field])) return null;
  }

  const contract: Record<string, unknown> = {};
  for (const field of CONTRACT_FIELDS) {
    if (field === "isPrimary") contract[field] = Boolean(row[field]);
    else contract[field] = nullableString(row[field]);
  }
  return { employmentId, contract: normalizeContractRecord(contract) };
}

export async function updateEmployeeProfileContracts(
  employeeId: number,
  rows: unknown,
  userId: number,
): Promise<ServiceResult<{ success: true }>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return { ok: false, error: "员工ID无效" };
  if (!Array.isArray(rows)) return { ok: false, error: "请求体无效" };

  const employments = await prisma.employment.findMany({
    where: { employeeId },
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (employments.length === 0) return { ok: false, error: "该员工无雇佣记录", status: 404 };

  const employmentIds = new Set(employments.map((row) => row.id));
  const fallbackEmploymentId = employments[0].id;
  const grouped = new Map<number, Record<string, unknown>[]>();
  let primarySeen = false;

  for (const row of rows) {
    const normalized = await normalizeContractRow(row as ContractBodyRow, fallbackEmploymentId);
    if (!normalized) return { ok: false, error: "合同记录校验失败" };
    if (!employmentIds.has(normalized.employmentId)) return { ok: false, error: "合同记录不属于该员工" };
    if (normalized.contract.isPrimary === true) {
      if (primarySeen) normalized.contract.isPrimary = false;
      primarySeen = true;
    }
    const list = grouped.get(normalized.employmentId) ?? [];
    list.push(normalized.contract);
    grouped.set(normalized.employmentId, list);
  }

  await prisma.$transaction(async (tx) => {
    for (const employment of employments) {
      await tx.employment.update({
        where: { id: employment.id },
        data: {
          contracts: JSON.stringify(grouped.get(employment.id) ?? []),
          editedBy: userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }
  });

  await Promise.all(employments.map((employment) => snapshotHistory("Employment", employment.id, userId)));
  return { ok: true, data: { success: true } };
}
