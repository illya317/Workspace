import { getInitials } from "./search";

/**
 * 各模型的搜索字段（Prisma v7 无 dmmf，硬编码）。
 * 只包含用户可能搜索的业务字段，排除 ID、外键、审计字段。
 */
const SEARCH_FIELDS: Record<string, string[]> = {
  Employee: [
    "employeeId", "name", "alias", "idNumber", "otherId",
    "phone", "ethnicity", "hometown", "politics",
    "education", "title", "school", "major",
  ],
  Department: ["code", "name", "alias"],
  Company: ["code", "name", "fullName"],
  Project: ["name", "type", "description"],
  Position: ["code", "name", "alias"],
};

/** 建议走拼音首字母搜索的字段 */
const PINYIN_FIELDS = new Set(["name", "alias"]);

export function matchAnyField(
  record: Record<string, unknown>,
  keyword: string,
  modelName: string,
): boolean {
  const fields = SEARCH_FIELDS[modelName];
  if (!fields) return false;

  const query = keyword.toLowerCase();

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
  return SEARCH_FIELDS[modelName] || [];
}
