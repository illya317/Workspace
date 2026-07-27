export function versionCreatedDate(value: string) {
  return value.slice(0, 10);
}

export function categoryLabel(value: string) {
  return ({ asset: "资产", liability: "负债", common: "共同", equity: "权益", income: "收入", revenue: "收入", expense: "费用", cost: "成本" } as Record<string, string>)[value] ?? value;
}

export function balanceDirectionLabel(value: string) {
  return value === "debit" ? "借" : value === "credit" ? "贷" : value;
}

export const REVIEW_STATUS_FILTER_OPTIONS = [
  { value: "confirmed", label: "已确认" },
  { value: "reviewed", label: "已复核" },
  { value: "pending_review", label: "待复核" },
] as const;

export const GROUP_ACCOUNT_USAGE_FILTER_OPTIONS = [
  { value: "", label: "全部科目" },
  { value: "consolidation", label: "合并科目" },
  { value: "reclassification", label: "重分类科目" },
] as const;
