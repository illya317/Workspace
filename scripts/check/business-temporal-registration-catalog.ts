import { ADMINISTRATION_BUSINESS_TEMPORAL_REGISTRATIONS } from "../../packages/administration/business-temporal";
import { CAPITAL_BUSINESS_TEMPORAL_REGISTRATIONS } from "../../packages/capital-securities/business-temporal";
import { EXTERNAL_BUSINESS_TEMPORAL_REGISTRATIONS } from "../../packages/external/business-temporal";
import { FINANCE_BUSINESS_TEMPORAL_REGISTRATIONS } from "../../packages/finance/business-temporal";
import { HR_BUSINESS_TEMPORAL_REGISTRATIONS } from "../../packages/hr/business-temporal";
import { LIBRARY_BUSINESS_TEMPORAL_REGISTRATIONS } from "../../packages/library/business-temporal";
import { WORK_BUSINESS_TEMPORAL_REGISTRATIONS } from "../../packages/work/business-temporal";

export const WORKSPACE_BUSINESS_TEMPORAL_REGISTRATIONS = [
  ...HR_BUSINESS_TEMPORAL_REGISTRATIONS,
  ...WORK_BUSINESS_TEMPORAL_REGISTRATIONS,
  ...ADMINISTRATION_BUSINESS_TEMPORAL_REGISTRATIONS,
  ...CAPITAL_BUSINESS_TEMPORAL_REGISTRATIONS,
  ...EXTERNAL_BUSINESS_TEMPORAL_REGISTRATIONS,
  ...LIBRARY_BUSINESS_TEMPORAL_REGISTRATIONS,
  ...FINANCE_BUSINESS_TEMPORAL_REGISTRATIONS,
] as const;
