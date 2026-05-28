import { SHARED_GROUP_CODES } from "@/lib/company";
import type { Employee, CodeItem } from "./types";

export function buildFullCode(shortCode: string, companyCode: string): string {
  const normalized = companyCode
    ? SHARED_GROUP_CODES.includes(companyCode)
      ? "01"
      : companyCode
    : "";
  return normalized ? normalized + shortCode : shortCode;
}

export function getDetailList(
  employees: Employee[],
  type: "department" | "position",
  codeItem: CodeItem
): Employee[] {
  if (type === "department") {
    return employees.filter((e) => e.dept1 === codeItem.name);
  }
  return employees.filter(
    (e) => e.position && e.position.includes(codeItem.name)
  );
}

export function toggleSort(
  currentField: "code" | "name" | "count",
  currentDirection: "asc" | "desc",
  clickedField: "code" | "name" | "count"
): { sortField: "code" | "name" | "count"; sortDirection: "asc" | "desc" } {
  if (currentField === clickedField) {
    return {
      sortField: currentField,
      sortDirection: currentDirection === "asc" ? "desc" : "asc",
    };
  }
  return { sortField: clickedField, sortDirection: "asc" };
}

export function getSortedCodes(
  codes: CodeItem[],
  stats: Record<string, number>,
  sortField: "code" | "name" | "count",
  sortDirection: "asc" | "desc"
): CodeItem[] {
  return [...codes].sort((a, b) => {
    if (sortField === "count") {
      const aVal = stats[a.code] || 0;
      const bVal = stats[b.code] || 0;
      if (aVal !== bVal)
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      return a.code.localeCompare(b.code);
    }
    const aVal = sortField === "code" ? a.code : a.name;
    const bVal = sortField === "code" ? b.code : b.name;
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });
}
