// 公司编码 ↔ 名称（同步自 Company 表，手动维护）
export const CODE_TO_NAME: Record<string, string> = {
  "01": "丰华生物",
  "02": "丰华天力通",
  "03": "丰华悦通",
  "04": "丰华制药",
  "05": "加拿大",
};

export const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_TO_NAME).map(([k, v]) => [v, k])
);

// 管理体系（对应 Company.managementGroup）
export const MANAGEMENT_GROUPS = ["全部", "丰华生物体系", "丰华制药"];

// 丰华生物体系 — 除丰华制药外的所有实体
export const FENGHUA_BIO_GROUP = ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"];

// 共享代码池（部门/岗位编码共用前缀）
export const SHARED_GROUP_CODES = ["01", "02", "03"];

export const ALL_COMPANIES = [...FENGHUA_BIO_GROUP, "丰华制药"];

// 管理体系筛选：返回管理体系名用于 DB 查询
export function resolveCompanyFilter(group: string): string[] {
  if (group === "全部") return ["丰华生物体系", "丰华制药"];
  if (group === "丰华生物体系") return ["丰华生物体系"];
  if (group === "丰华制药") return ["丰华制药"];
  return [group];
}

// 编码 → 公司名（兼容2位公司码和多位部门/岗位码前缀）
export function getCompanyFromCode(code: string): string {
  const prefix = code.slice(0, 2);
  return CODE_TO_NAME[prefix] || "";
}

export function isPharma(code: string): boolean {
  return code.slice(0, 2) === "04";
}

export function isBio(code: string): boolean {
  return code.slice(0, 2) !== "04";
}
