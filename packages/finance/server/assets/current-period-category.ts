export function fixedCategoryCandidate(sourceCategory: string | undefined, name: string) {
  const category = sourceCategory?.trim() ?? "";
  if (category.includes("机器")) return "FA-MACHINERY";
  if (category.includes("运输")) return "FA-TRANSPORT";
  if (category.includes("电子")) return "FA-ELECTRONIC";
  if (category.includes("办公")) return "FA-OFFICE";
  if (category === "其他") return "FA-OTHER";
  if (/计算机|笔记本|电视|手机|办公本|相机/.test(name)) return "FA-ELECTRONIC";
  return "PENDING-FIXED";
}

export function intangibleCategoryCandidate(name: string) {
  if (name.includes("软件")) return "IA-SOFTWARE";
  if (name.includes("土地")) return "IA-LAND-USE";
  if (/牌照|许可/.test(name)) return "IA-LICENSE";
  return "PENDING-INTANGIBLE";
}

export function prepaidCategoryCandidate(name: string) {
  if (name.includes("车位")) return "PA-PARKING";
  if (/房租|宿舍/.test(name)) return "PA-RENT";
  if (name.includes("网络")) return "PA-NETWORK";
  return "PA-OTHER";
}
