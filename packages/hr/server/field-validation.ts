import { prisma } from "@workspace/platform/server/prisma";
import {
  isValidDateValue,
  rejectInvalidDateField,
} from "@workspace/platform/server/api";
import { isAllowedHrOption, normalizeProfessionalTitle, tenantHrFieldOptions } from "@workspace/hr/constants/field-options";
import { getTenantPublicConfig } from "@workspace/platform/server/tenant-config";
import { normalizePhoneValue, validateChineseIdNumber } from "@workspace/hr/utils/identity";
import { STANDARD_EMPLOYMENT_AGREEMENT_TYPES } from "@workspace/hr/constants";

export { isValidDateValue, rejectInvalidDateField };

export async function isValidCompanyName(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  const company = await prisma.company.findFirst({
    where: { party: { name: value } },
    select: { id: true },
  });
  return Boolean(company);
}

export function normalizeEmployeeOption(field: string, value: unknown) {
  const options = tenantHrFieldOptions(getTenantPublicConfig());
  if (field === "phone") {
    return { field, value: normalizePhoneValue(value) };
  }
  if (field === "idNumber") {
    const result = validateChineseIdNumber(value);
    if (!result.ok) return { error: result.error };
    return { field, value: result.value };
  }

  const aliases = getTenantPublicConfig().hr.optionAliases;
  if (typeof value === "string" && field === "ethnicity") value = aliases.ethnicities[value] ?? value;
  if (typeof value === "string" && field === "politics") value = aliases.politics[value] ?? value;
  if (typeof value === "string" && field === "education") value = aliases.educations[value] ?? value;

  if (field === "ethnicity" && !isAllowedHrOption(value, options.ethnicities)) return null;
  if (field === "politics" && !isAllowedHrOption(value, options.politics)) return null;
  if (field === "education" && !isAllowedHrOption(value, options.educations)) return null;
  if (field === "title") {
    if (value === null || value === undefined || value === "") return { field, value: null };
    const normalized = normalizeProfessionalTitle(value, options);
    if (!normalized || !options.professionalTitles.includes(normalized)) return null;
    return { field, value: normalized };
  }
  return { field, value };
}

export function validateEmploymentOption(field: string, value: unknown) {
  const options = tenantHrFieldOptions(getTenantPublicConfig());
  if (field === "officeLocation" && !isAllowedHrOption(value, options.officeLocations)) return null;
  if (field === "personnelType" && !isAllowedHrOption(value, options.personnelTypes)) return null;
  if (field === "rank" && !isAllowedHrOption(value, options.ranks)) return null;
  if (field === "title" && !isAllowedHrOption(value, options.employmentTitles)) return null;
  if (field === "leaveReason" && !isAllowedHrOption(value, options.leaveReasons)) return null;
  return { field, value };
}

export function validateContractOption(field: string, value: unknown) {
  const options = tenantHrFieldOptions(getTenantPublicConfig());
  if (field === "legalRelation" && !isAllowedHrOption(value, options.legalRelations)) return null;
  if (field === "contractType" && !isAllowedHrOption(value, [...options.contractTypes, ...STANDARD_EMPLOYMENT_AGREEMENT_TYPES])) return null;
  if (field === "employmentForm" && !isAllowedHrOption(value, options.employmentForms)) return null;
  if (field === "insuranceStatus" && !isAllowedHrOption(value, options.insuranceStatuses)) return null;
  return { field, value };
}

export function parseAllocationWeight(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

export function deriveAllocationPercent(
  weight: unknown,
  activeWeights: readonly unknown[],
) {
  const parsedWeight = parseAllocationWeight(weight);
  const parsedWeights = activeWeights.map(parseAllocationWeight);
  if (
    parsedWeight === null
    || Number.isNaN(parsedWeight)
    || parsedWeight <= 0
    || parsedWeights.some((value) => value === null || Number.isNaN(value) || value <= 0)
  ) return null;
  const total = parsedWeights.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return total > 0 ? parsedWeight / total : null;
}
