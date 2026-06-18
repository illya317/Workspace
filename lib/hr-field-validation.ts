import { prisma } from "@/lib/prisma";
import {
  HR_CONTRACT_TYPES,
  HR_EMPLOYMENT_TITLES,
  HR_EDUCATIONS,
  HR_EMPLOYMENT_FORMS,
  HR_ETHNICITIES,
  HR_INSURANCE_STATUSES,
  HR_LEGAL_RELATIONS,
  HR_OFFICE_LOCATIONS,
  HR_PERSONNEL_TYPES,
  HR_POLITICS,
  HR_PROFESSIONAL_TITLES,
  HR_RANKS,
  isAllowedHrOption,
  normalizeProfessionalTitle,
} from "@/lib/hr-field-options";
import { normalizePhoneValue, validateChineseIdNumber } from "@/lib/hr-identity";

export function isValidDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === monthIndex &&
    parsed.getDate() === day
  );
}

export function rejectInvalidDateField(field: string, value: unknown, dateFields: readonly string[]) {
  if (dateFields.includes(field) && !isValidDateValue(value)) return null;
  return { field, value };
}

export async function isValidCompanyName(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  const company = await prisma.company.findFirst({
    where: { name: value },
    select: { id: true },
  });
  return Boolean(company);
}

export function normalizeEmployeeOption(field: string, value: unknown) {
  if (field === "phone") {
    return { field, value: normalizePhoneValue(value) };
  }
  if (field === "idNumber") {
    const result = validateChineseIdNumber(value);
    if (!result.ok) return { error: result.error };
    return { field, value: result.value };
  }

  if (value === "汉") value = "汉族";
  if (value === "回") value = "回族";
  if (value === "蒙古") value = "蒙古族";
  if (value === "中共党员") value = "党员";
  if (value === "专科") value = "大专";
  if (value === "本科/EMBA") value = "本科";
  if (value === "研究生") value = "硕士";
  if (["初中", "高中", "中专"].includes(String(value))) value = "其他";

  if (field === "ethnicity" && !isAllowedHrOption(value, HR_ETHNICITIES)) return null;
  if (field === "politics" && !isAllowedHrOption(value, HR_POLITICS)) return null;
  if (field === "education" && !isAllowedHrOption(value, HR_EDUCATIONS)) return null;
  if (field === "title") {
    if (value === null || value === undefined || value === "") return { field, value: null };
    const normalized = normalizeProfessionalTitle(value);
    if (!normalized || !HR_PROFESSIONAL_TITLES.includes(normalized)) return null;
    return { field, value: normalized };
  }
  return { field, value };
}

export function validateEmploymentOption(field: string, value: unknown) {
  if (field === "officeLocation" && !isAllowedHrOption(value, HR_OFFICE_LOCATIONS)) return null;
  if (field === "personnelType" && !isAllowedHrOption(value, HR_PERSONNEL_TYPES)) return null;
  if (field === "rank" && !isAllowedHrOption(value, HR_RANKS)) return null;
  if (field === "title" && !isAllowedHrOption(value, HR_EMPLOYMENT_TITLES)) return null;
  return { field, value };
}

export function validateContractOption(field: string, value: unknown) {
  if (field === "legalRelation" && !isAllowedHrOption(value, HR_LEGAL_RELATIONS)) return null;
  if (field === "contractType" && !isAllowedHrOption(value, HR_CONTRACT_TYPES)) return null;
  if (field === "employmentForm" && !isAllowedHrOption(value, HR_EMPLOYMENT_FORMS)) return null;
  if (field === "insuranceStatus" && !isAllowedHrOption(value, HR_INSURANCE_STATUSES)) return null;
  return { field, value };
}

export function parseWorkPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const numberText = text.endsWith("%") ? text.slice(0, -1).trim() : text;
  const parsed = Number(numberText);
  if (!Number.isFinite(parsed)) return Number.NaN;
  const normalized = text.endsWith("%") ? parsed / 100 : parsed;
  return normalized;
}
