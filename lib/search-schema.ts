import { Prisma } from "@/generated/prisma/client";
import { getInitials } from "./search";

const EXCLUDE_FIELDS = new Set([
  "id", "editedBy", "version", "sortOrder", "queryGroup",
  "userId", "password", "apiKey", "wxUserId",
  "dataJson", "itemsJson", "details", "contracts",
  "parentId", "childId", "employeeId", "departmentId", "positionId",
  "projectId", "workItemId", "reportId", "resourceId", "roleId",
  "scopeId", "targetId", "managerUserId",
  "headcount", "level", "isActive", "isPrimary", "isArchived",
  "isPrivate", "isConsolidated", "isResearch", "canLogin",
  "success", "gender", "shareRatio",
]);

const modelStringFields: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  const dmmf = (Prisma as unknown as { dmmf: { datamodel: { models: { name: string; fields: { kind: string; type: string; name: string }[] }[] } } }).dmmf;
  if (!dmmf?.datamodel?.models) return map;

  for (const model of dmmf.datamodel.models) {
    const stringFields = model.fields
      .filter(
        (f: { kind: string; type: string; name: string }) =>
          f.kind === "scalar" &&
          f.type === "String" &&
          !EXCLUDE_FIELDS.has(f.name)
      )
      .map((f) => f.name);
    if (stringFields.length) {
      map[model.name] = stringFields;
    }
  }
  return map;
})();

const PINYIN_FIELDS = new Set(["name", "alias", "departmentName"]);

export function matchAnyField(
  record: Record<string, unknown>,
  keyword: string,
  modelName: string
): boolean {
  const query = keyword.toLowerCase();
  const fields = modelStringFields[modelName];
  if (!fields) return false;

  for (const f of fields) {
    const val = String(record[f] ?? "").toLowerCase();
    if (val.includes(query)) return true;
    if (PINYIN_FIELDS.has(f)) {
      if (getInitials(val).includes(query)) return true;
    }
  }
  return false;
}

export function getSearchFields(modelName: string): string[] {
  return modelStringFields[modelName] || [];
}
