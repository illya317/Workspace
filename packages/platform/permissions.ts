export type BusinessSpaceUsage = "work" | "docsTemplate";
export type BusinessSpaceTargetType = "personal" | "company" | "committee" | "department" | "project" | "position" | "other";

export function businessSpaceKindLabel(targetType: BusinessSpaceTargetType | string, usage: BusinessSpaceUsage) {
  if (targetType === "personal") return "个人";
  if (targetType === "department") return "部门";
  if (targetType === "committee") return "运营委员会";
  if (targetType === "project") return "项目";
  if (targetType === "position") return "岗位";
  if (targetType === "company") return usage === "docsTemplate" ? "公司" : "公司";
  if (targetType === "other") return "其他";
  return "空间";
}

export function businessSpaceGroupTitle(targetType: BusinessSpaceTargetType | string, usage: BusinessSpaceUsage) {
  if (targetType === "company" && usage === "docsTemplate") return "公共模板";
  return `${businessSpaceKindLabel(targetType, usage)}空间`;
}
