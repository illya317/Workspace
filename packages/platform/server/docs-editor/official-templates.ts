import "server-only";

import hrPositionDescriptionTemplate from "./official-template-sources/hr-position-description.json";

export const DOCS_EDITOR_OFFICIAL_TEMPLATE_COUNT = 17;

export const QC_OFFICIAL_TEMPLATE_SOURCE_KIND = "production.qc.official";
export const QC_OFFICIAL_TEMPLATE_STAGE_KEYS = JSON.stringify(["intermediate", "packaging", "finished"]);
export const QC_OFFICIAL_TEMPLATE_PRODUCT_KEYS = [
  "allopurinol",
  "atenolol",
  "azithromycin",
  "berberine_tannate",
  "clarithromycin",
  "compound_rutin",
  "diammonium_glycyrrhizinate",
  "hydrochlorothiazide",
  "isosorbide_dinitrate",
  "levofloxacin",
  "methimazole",
  "pantoprazole",
  "simvastatin",
  "spironolactone",
  "terazosin",
  "verapamil",
] as const;

export const HR_POSITION_DESCRIPTION_TEMPLATE_SOURCE_KIND = "hr.position-description.official";
export const HR_POSITION_DESCRIPTION_TEMPLATE_PRODUCT_KEY = "hr.position-description.default";
export const HR_POSITION_DESCRIPTION_DEPARTMENT_CODE = "FUN102";
export const HR_POSITION_DESCRIPTION_DEPARTMENT_NAME = "人力资源部";

export function hrPositionDescriptionOfficialTemplateSource() {
  return hrPositionDescriptionTemplate;
}
