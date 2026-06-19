import { NextResponse } from "next/server";
import { Prisma } from "@workspace/platform/server/prisma";
import { handleCreate, handleUpdateField } from "./hr-crud";
import { isValidDateValue, rejectInvalidDateField, validateEmploymentOption } from "./field-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { matchEmployee } from "./search";
import { parseContracts } from "./contracts";

const DATE_FIELDS = ["joinDate", "leaveDate"];
const EMPLOYMENT_CONFIG = { entityType: "Employment", modelKey: "employment" as const };
const EMPLOYMENT_FIELDS = [
  "employeeId",
  "isActive",
  "joinDate",
  "leaveDate",
  "leaveReason",
  "leaveNote",
  "officeLocation",
  "personnelType",
  "rank",
  "title",
  "contracts",
];

function primaryContractCompany(contractsJson: string | null, fallback: string | null) {
  const contracts = parseContracts(contractsJson);
  const primaryCompany = String(contracts.find((contract) => contract.isPrimary === true && contract.company)?.company ?? "");
  const firstCompany = String(contracts.find((contract) => contract.company)?.company ?? "");
  return primaryCompany || firstCompany || fallback || null;
}

async function normalizeEmploymentFieldUpdate(field: string, value: unknown) {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  const optionResult = validateEmploymentOption(field, value);
  if (!optionResult) return null;
  return { field, value };
}

export async function listEmployments(input: {
  keyword: string;
  isActive: string | null;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.EmploymentWhereInput = {};
  if (input.isActive !== null && input.isActive !== "") {
    where.isActive = input.isActive === "true" ? true : input.isActive === "false" ? false : undefined;
  }

  const items = await prisma.employment.findMany({
    where,
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const mapped = items.map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employee?.name || "",
    isActive: item.isActive,
    currentCompany: primaryContractCompany(item.contracts, item.currentCompany),
    joinDate: item.joinDate,
    leaveDate: item.leaveDate,
    leaveReason: item.leaveReason,
    leaveNote: item.leaveNote,
    officeLocation: item.officeLocation,
    personnelType: item.personnelType,
    rank: item.rank,
    title: item.title,
    contracts: item.contracts,
  }));

  let filtered = mapped;
  if (input.keyword) {
    filtered = mapped.filter(
      (employment) =>
        matchEmployee({ name: employment.employeeName, employeeId: String(employment.employeeId) }, input.keyword) ||
        employment.employeeName?.includes(input.keyword),
    );
  }

  const total = filtered.length;
  const start = (input.page - 1) * input.pageSize;
  return { items: filtered.slice(start, start + input.pageSize), total };
}

export async function createEmployment(request: Request) {
  return handleCreate(request, EMPLOYMENT_CONFIG, async (body) => {
    if (!body.employeeId) return null;
    for (const field of DATE_FIELDS) if (!isValidDateValue(body[field])) return null;
    if (!validateEmploymentOption("officeLocation", body.officeLocation)) return null;
    if (!validateEmploymentOption("personnelType", body.personnelType)) return null;
    if (!validateEmploymentOption("rank", body.rank)) return null;
    if (!validateEmploymentOption("title", body.title)) return null;
    if (!validateEmploymentOption("leaveReason", body.leaveReason)) return null;
    const safeBody = { ...body };
    delete safeBody.currentCompany;
    delete safeBody.attendanceType;
    return safeBody;
  });
}

export async function updateEmploymentField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, {
    ...EMPLOYMENT_CONFIG,
    allowedFields: EMPLOYMENT_FIELDS,
    onBeforeUpdate: normalizeEmploymentFieldUpdate,
  });
}

export function rejectEmploymentDelete() {
  return NextResponse.json({ error: "雇佣记录不允许删除" }, { status: 405 });
}
