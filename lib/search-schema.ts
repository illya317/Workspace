import { readFileSync } from "fs";
import { resolve } from "path";
import { getInitials } from "./search";

const SCHEMA_PATH = resolve(process.cwd(), "prisma/schema.prisma");
const schemaText = readFileSync(SCHEMA_PATH, "utf8");

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
  const models = schemaText.match(/model\s+(\w+)\s*\{/g) || [];
  for (const m of models) {
    const name = m.replace("model ", "").replace(" {", "").trim();
    const block = schemaText.match(
      new RegExp(`model\\s+${name}\\s*\\{([^}]+)\\}`)
    );
    if (!block) continue;
    const fields = block[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"));
    const stringFields: string[] = [];
    for (const f of fields) {
      const parts = f.split(/\s+/);
      if (parts.length < 3) continue;
      const fieldName = parts[0];
      const fieldType = parts[1].replace("?", "").replace("[]", "");
      if (fieldType === "String" && !EXCLUDE_FIELDS.has(fieldName)) {
        stringFields.push(fieldName);
      }
    }
    if (stringFields.length) map[name] = stringFields;
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
