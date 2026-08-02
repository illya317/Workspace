import "server-only";

import hrPositionDescriptionTemplate from "./official-template-sources/hr-position-description.json";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

export const QC_OFFICIAL_TEMPLATE_SOURCE_KIND = "production.qc.official";
export const QC_OFFICIAL_TEMPLATE_STAGE_KEYS = JSON.stringify(["intermediate", "packaging", "finished"]);

export const HR_POSITION_DESCRIPTION_TEMPLATE_SOURCE_KIND = "hr.position-description.official";
export const HR_POSITION_DESCRIPTION_TEMPLATE_PRODUCT_KEY = "hr.position-description.default";

export function docsEditorOfficialTemplateCount() {
  return getTenantProfile().docs.officialQcProductKeys.length + 1;
}

export function qcOfficialTemplateProductKeys() {
  return getTenantProfile().docs.officialQcProductKeys;
}

export function hrPositionDescriptionDepartment() {
  return getTenantProfile().docs.hrPositionDescriptionDepartment;
}

export function hrPositionDescriptionOfficialTemplateSource() {
  return hrPositionDescriptionTemplate;
}
