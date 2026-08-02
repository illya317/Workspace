export const COMPANY_DOCUMENTS_UI_PATH = "/docs/company";
export const COMPANY_DOCUMENTS_API_PATH = "/api/modules/docs/company/documents";
export const COMPANY_PERMISSION_ACTIONS_API_PATH = "/api/modules/docs/company/permission-actions";

export function companyDocumentStructuredPath(documentKey: string) {
  return `${COMPANY_DOCUMENTS_API_PATH}/${encodeURIComponent(documentKey)}`;
}

export const COMPANY_DOCUMENTATION_REFERENCE = {
  uiPath: COMPANY_DOCUMENTS_UI_PATH,
  catalogPath: COMPANY_DOCUMENTS_API_PATH,
  sectionPathTemplate: `${COMPANY_DOCUMENTS_API_PATH}/:documentKey?section=:sectionKey`,
  searchPathTemplate: `${COMPANY_DOCUMENTS_API_PATH}/:documentKey?q=:query`,
  permissionQueryPath: COMPANY_PERMISSION_ACTIONS_API_PATH,
  guidance: "Fetch the document catalog first, then retrieve only the relevant section. The API Agent guide explains discovery and writes; the permission endpoint answers exact resource/action questions.",
} as const;

export type CompanyDocumentItem = {
  key: string;
  title: string;
  description: string;
  format: "office" | "paper";
  fileName: string;
  fileSizeBytes: number;
  updatedAt: string;
  markdown: string | null;
};
