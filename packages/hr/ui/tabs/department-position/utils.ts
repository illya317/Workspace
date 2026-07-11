import type { CreateDepartmentDraft, Department, Position } from "./types";

export type OrganizationHierarchyKind = "G" | "M";

export function normalizeHierarchyKind(value: unknown): OrganizationHierarchyKind {
  return value === "G" ? "G" : "M";
}

export function organizationLevelCode(value: { hierarchyKind?: string | null; level: number }) {
  return `${normalizeHierarchyKind(value.hierarchyKind)}${value.level}`;
}

export function parseAlias(alias: string | null) {
  if (!alias) return "";
  try {
    const parsed = JSON.parse(alias);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join("、");
  } catch {}
  return alias;
}

export function splitAliasText(value: string) {
  return [...new Set(value.split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean))];
}

export function serializeAlias(value: string) {
  const items = splitAliasText(value);
  return items.length > 0 ? JSON.stringify([...new Set(items)]) : null;
}

export function departmentPath(department: Department | undefined, departmentById: Map<number, Department>) {
  if (!department) return "";
  const parts: string[] = [];
  let current: Department | undefined = department;
  const guard = new Set<number>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    parts.unshift(current.name);
    current = displayParentDepartment(current, departmentById);
  }
  return parts.join(" / ");
}

export function departmentParentPath(department: Department | undefined, departmentById: Map<number, Department>) {
  if (!department?.parentId) return "";
  return departmentPath(departmentById.get(department.parentId), departmentById);
}

export function departmentDescendantIds(department: Department, departmentById: Map<number, Department>): Set<number> {
  const ids = new Set<number>();
  const stack = [...(department.children ?? []).filter((child) => departmentById.get(child.id)?.hierarchyKind === department.hierarchyKind)];
  while (stack.length > 0) {
    const child = stack.pop()!;
    ids.add(child.id);
    const childDept = departmentById.get(child.id);
    if (childDept) stack.push(...(childDept.children ?? []).filter((next) => departmentById.get(next.id)?.hierarchyKind === department.hierarchyKind));
  }
  return ids;
}

export function isOperatingCommittee(department: Department | undefined) {
  return department?.hierarchyKind === "G" && department.code === "OPS";
}

export function displayParentDepartment(department: Department, departmentById: Map<number, Department>) {
  const parent = department.parentId ? departmentById.get(department.parentId) : undefined;
  return parent && parent.hierarchyKind === department.hierarchyKind ? parent : undefined;
}

export function displayParentId(department: Department, departmentById: Map<number, Department>) {
  return displayParentDepartment(department, departmentById)?.id ?? null;
}

export function canUseDepartmentAsParentForHierarchy({
  candidate,
  hierarchyKind,
  level,
}: {
  candidate: Department;
  hierarchyKind: OrganizationHierarchyKind;
  level: 1 | 2 | 3;
}) {
  if (hierarchyKind === "M" && level === 1) return isOperatingCommittee(candidate);
  if (level === 1) return false;
  return candidate.hierarchyKind === hierarchyKind && candidate.level === level - 1;
}

export function archiveTimestamp(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function formatArchiveTime(value: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function shortPositionCode(code: string) {
  const parts = code.split("-");
  return parts[parts.length - 1] || code;
}

export function positionCodeSuffix(code: string) {
  const match = String(code || "").trim().match(/-(\d{1,2})$/);
  if (match) return match[1];
  const tail = String(code || "").trim().split("-").pop() || "";
  const digits = tail.replace(/\D/g, "").slice(0, 2);
  return digits ? digits.padStart(2, "0") : "";
}

export function positionCodePrefix(department: Department | undefined) {
  return department?.code ? `GW-${department.code}-` : "";
}

export function positionCodePrefixFromCode(code: string) {
  const suffix = positionCodeSuffix(code);
  return suffix ? code.slice(0, -suffix.length) : "";
}

export function composePositionCode(department: Department | undefined, suffix: string, fallbackCode: string) {
  const cleanSuffix = suffix.replace(/\D/g, "").slice(0, 2);
  const prefix = positionCodePrefix(department);
  if (!prefix) return fallbackCode;
  return `${prefix}${cleanSuffix}`;
}

export function usedDepartmentPrefixes(departments: Department[]) {
  return new Set(departments.map((department) => department.code.slice(0, 3)).filter((prefix) => /^[A-Z]{3}$/.test(prefix)));
}

export function nextGeneratedDepartmentPrefix(departments: Department[]) {
  const used = usedDepartmentPrefixes(departments);
  for (const preferred of ["ORG", "NEW", "DPT", "BPW"]) {
    if (!used.has(preferred)) return preferred;
  }
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      for (let third = 65; third <= 90; third += 1) {
        const prefix = String.fromCharCode(first, second, third);
        if (!used.has(prefix)) return prefix;
      }
    }
  }
  return "";
}

export function normalizeDepartmentCodeInput(level: CreateDepartmentDraft["level"], value: string, hierarchyKind: OrganizationHierarchyKind = "M") {
  if (hierarchyKind === "G") return value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3);
  if (level === 1) return value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3);
  if (level === 2) return value.replace(/\D/g, "").slice(0, 4);
  return value.replace(/\D/g, "").slice(0, 2);
}

export function normalizeDepartmentFullCodeInput(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
}

export function departmentCodePrefix(department: Department | undefined) {
  const prefix = department?.code.slice(0, 3) || "";
  return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
}

export function departmentCodeNumber(department: Department | undefined) {
  const suffix = department?.code.slice(3) || "";
  return /^\d+$/.test(suffix) ? suffix : "";
}

export function suggestDepartmentCodeInput(draft: CreateDepartmentDraft, departments: Department[]) {
  if (draft.hierarchyKind === "G") {
    return nextGeneratedDepartmentPrefix(departments);
  }
  if (draft.level === 1) {
    return nextGeneratedDepartmentPrefix(departments);
  }
  const parent = departments.find((department) => department.id === draft.parentId);
  if (!parent) return "";
  const prefix = departmentCodePrefix(parent);
  if (!prefix) return "";
  const usedCodes = new Set(departments.map((department) => department.code));
  if (draft.level === 2) {
    for (let number = 1; number <= 999; number += 1) {
      const suffix = `${number}00`;
      if (!usedCodes.has(`${prefix}${suffix}`)) return String(number);
    }
    return "";
  }
  const parentNumber = departmentCodeNumber(parent);
  if (!parentNumber || !parentNumber.endsWith("00")) return "";
  const stem = parentNumber.slice(0, -2);
  for (let number = 1; number <= 99; number += 1) {
    const tail = String(number).padStart(2, "0");
    const suffix = `${stem}${tail}`;
    if (!usedCodes.has(`${prefix}${suffix}`)) return tail;
  }
  return "";
}

export function composeDepartmentCode(draft: CreateDepartmentDraft, departments: Department[]) {
  const codeInput = draft.code.trim();
  if (draft.hierarchyKind === "G") return /^[A-Z]{3}$/.test(codeInput) ? codeInput : "";
  if (draft.level === 1) return /^[A-Z]{3}$/.test(codeInput) ? `${codeInput}001` : "";
  const parent = departments.find((department) => department.id === draft.parentId);
  const prefix = departmentCodePrefix(parent);
  if (!prefix || !/^\d+$/.test(codeInput)) return "";
  if (draft.level === 2) return `${prefix}${Number(codeInput)}00`;
  const parentNumber = departmentCodeNumber(parent);
  if (!parentNumber || !parentNumber.endsWith("00")) return "";
  return `${prefix}${parentNumber.slice(0, -2)}${codeInput.padStart(2, "0")}`;
}

function departmentCodeExists(code: string, departments: Department[], exceptDepartmentId?: number) {
  return departments.some((department) => department.id !== exceptDepartmentId && department.code === code);
}

function departmentCodeSegmentForLevel(code: string, level: CreateDepartmentDraft["level"], hierarchyKind: OrganizationHierarchyKind = "M") {
  if (hierarchyKind === "G") {
    const prefix = code.slice(0, 3).toUpperCase();
    return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
  }
  if (level === 1) {
    const prefix = code.slice(0, 3).toUpperCase();
    return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
  }
  if (level === 2) {
    const segment = code.slice(3, -2).replace(/\D/g, "");
    return /^[1-9]\d*$/.test(segment) ? segment : "";
  }
  const tail = code.slice(-2).replace(/\D/g, "");
  const tailNumber = Number(tail);
  return tailNumber >= 1 && tailNumber <= 99 ? tail.padStart(2, "0") : "";
}

export function rebaseDepartmentCodeForParentChange({
  code,
  departmentId,
  level,
  hierarchyKind,
  parentId,
  departments,
}: {
  code: string;
  departmentId: number;
  level: CreateDepartmentDraft["level"];
  hierarchyKind: OrganizationHierarchyKind;
  parentId: number | null;
  departments: Department[];
}) {
  const segment = departmentCodeSegmentForLevel(code, level, hierarchyKind);
  const draft = { hierarchyKind, level, parentId, code: segment, name: "" };
  const candidate = composeDepartmentCode(draft, departments);
  if (candidate && !departmentCodeExists(candidate, departments, departmentId)) return candidate;

  const suggestion = suggestDepartmentCodeInput({ ...draft, code: "" }, departments);
  const fallback = composeDepartmentCode({ ...draft, code: suggestion }, departments);
  if (fallback && !departmentCodeExists(fallback, departments, departmentId)) return fallback;
  return candidate || code;
}

export function departmentCodeError(draft: CreateDepartmentDraft, departments: Department[]) {
  const codeInput = draft.code.trim();
  if (draft.hierarchyKind === "G") {
    if (!/^[A-Z]{3}$/.test(codeInput)) return `${organizationLevelCode(draft)} 编码必须是 3 位大写字母。`;
    if (draft.level > 1) {
      const parent = departments.find((department) => department.id === draft.parentId);
      if (!parent) return `${organizationLevelCode(draft)} 组织必须选择上级组织。`;
      if (parent.hierarchyKind !== "G" || parent.level !== draft.level - 1) return `${organizationLevelCode(draft)} 组织只能挂在 G${draft.level - 1} 组织下。`;
    }
  } else if (draft.level === 1) {
    if (!/^[A-Z]{3}$/.test(codeInput)) return "M1 编码必须是 3 位大写字母。";
    const parent = departments.find((department) => department.id === draft.parentId);
    if (!parent || !isOperatingCommittee(parent)) return "M1 组织上级组织必须选择运营委员会。";
  } else {
    const parent = departments.find((department) => department.id === draft.parentId);
    if (!parent) return `M${draft.level} 组织必须选择上级组织。`;
    if (!canUseDepartmentAsParentForHierarchy({ candidate: parent, hierarchyKind: "M", level: draft.level })) return `M${draft.level} 组织只能挂在 M${draft.level - 1} 组织下。`;
    if (!/^\d+$/.test(codeInput)) return `M${draft.level} 编码必须是纯数字。`;
    if (draft.level === 2) {
      if (Number(codeInput) < 1) return "M2 编码必须是正整数，系统会自动补 00。";
    } else {
      const parentNumber = departmentCodeNumber(parent);
      if (!parentNumber || !parentNumber.endsWith("00")) return "上级 M2 编码不合法。";
      if (codeInput.length < 1 || codeInput.length > 2 || Number(codeInput) < 1) return "M3 编码只输入最后两位，范围 01-99。";
    }
  }
  const fullCode = composeDepartmentCode(draft, departments);
  if (!fullCode) return "组织编码不合法。";
  if (departments.some((department) => department.code === fullCode)) return "组织编码已存在。";
  return "";
}

export function departmentCodePlaceholder(level: CreateDepartmentDraft["level"], hierarchyKind: OrganizationHierarchyKind = "M") {
  if (hierarchyKind === "G") return "OPS";
  if (level === 1) return "ABC";
  if (level === 2) return "1";
  return "01";
}

export function departmentCodeAffixes(draft: CreateDepartmentDraft, departments: Department[]) {
  if (draft.hierarchyKind === "G") return { prefix: "", suffix: "" };
  if (draft.level === 1) return { prefix: "", suffix: "001" };
  const parent = departments.find((department) => department.id === draft.parentId);
  const prefix = departmentCodePrefix(parent);
  if (draft.level === 2) return { prefix, suffix: "00" };
  const parentNumber = departmentCodeNumber(parent);
  return { prefix: parentNumber ? `${prefix}${parentNumber.slice(0, -2)}` : prefix, suffix: "" };
}

export function generatePositionCode(department: Department | undefined, positions: Position[]) {
  const prefix = positionCodePrefix(department);
  if (!prefix) return "";
  const usedCodes = new Set(positions.map((position) => position.code));
  for (let number = 1; number <= 99; number += 1) {
    const code = `${prefix}${String(number).padStart(2, "0")}`;
    if (!usedCodes.has(code)) return code;
  }
  return "";
}

export function plannedHeadcount(position: Pick<Position, "headcountPlan">) {
  return typeof position.headcountPlan === "number" && Number.isFinite(position.headcountPlan)
    ? Math.max(0, position.headcountPlan)
    : 0;
}
