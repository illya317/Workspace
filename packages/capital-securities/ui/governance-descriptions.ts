import type { OrganizationUnitDescriptionDraft } from "@workspace/platform/ui/organization-units";
import type { GovernanceOrganization } from "../types";

export function descriptionDraftsFromOrganization(organization: GovernanceOrganization) {
  return organization.descriptions.length > 0
    ? organization.descriptions.map((description) => createDescriptionDraft({
        id: description.id,
        code: description.code,
        name: description.name,
        sourceFile: description.sourceFile,
        codeRaw: description.codeRaw,
        details: description.details,
      }))
    : [createDescriptionDraft({ id: null, code: organization.code, name: organization.name })];
}

export function createDescriptionDraft(input: {
  id: number | null;
  code: string;
  name: string;
  sourceFile?: string;
  codeRaw?: string | null;
  details?: Record<string, unknown> | null;
}): OrganizationUnitDescriptionDraft {
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    sourceFile: input.sourceFile || "",
    codeRaw: input.codeRaw || "",
    details: JSON.stringify(input.details || JSON.parse(defaultDescriptionDetails(input.name)), null, 2),
  };
}

export function descriptionPayload(draft: OrganizationUnitDescriptionDraft) {
  return {
    id: draft.id,
    sourceFile: draft.sourceFile.trim(),
    codeRaw: draft.codeRaw.trim() || null,
    details: draft.details.trim() || null,
  };
}

export function normalizeDescriptionsForCompare(drafts: OrganizationUnitDescriptionDraft[]) {
  return JSON.stringify(drafts.map(descriptionPayload));
}

function defaultDescriptionDetails(name: string) {
  return JSON.stringify({
    "基本信息": {
      "部门名称": name,
    },
    "部门职责概要": [],
    "部门职责描述": [],
  }, null, 2);
}
