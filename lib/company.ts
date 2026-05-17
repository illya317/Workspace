// 公司编码 ↔ 名称
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

// 管理体系分组（页面展示用）
export const BIO_GROUP_CODES = ["01", "02", "03", "05"]; // 丰华生物体系
export const PHARMA_CODE = "04"; // 丰华制药

export function getManagementGroup(code: string): string {
  const prefix = code.slice(0, 2);
  return BIO_GROUP_CODES.includes(prefix) ? "丰华生物体系" : "丰华制药";
}

// 丰华生物集团（共享数据）
export const FENGHUA_BIO_GROUP = ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"];
export const FENGHUA_BIO_CODES = Object.keys(CODE_TO_NAME);
// 丰华生物 + 天力通 + 悦通（共享存储，code 前缀 01-03）
export const SHARED_GROUP_CODES = ["01", "02", "03"];

export const ALL_COMPANIES = [...FENGHUA_BIO_GROUP, "丰华制药"];

// 公司名筛选器：丰华生物集团的公司统一查询整个集团数据
export function resolveCompanyFilter(companyName: string): string[] {
  if (companyName === "全部") {
    return ALL_COMPANIES;
  }
  if (FENGHUA_BIO_GROUP.includes(companyName)) {
    return FENGHUA_BIO_GROUP;
  }
  return [companyName];
}

// 编码 → 公司名
export function getCompanyFromCode(code: string): string {
  const prefix = code.slice(0, 2);
  return CODE_TO_NAME[prefix] || "";
}
