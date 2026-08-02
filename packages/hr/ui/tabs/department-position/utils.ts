import type { CreateDepartmentDraft, Department, OrganizationCodeConfig, Position } from "./types";
import {
  isDepartmentIdentifier,
  normalizeDepartmentIdentifier,
} from "@workspace/platform/business-code-config";

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

export function isOperatingCommittee(department: Department | undefined, operatingCommitteeCode: string) {
  return department?.hierarchyKind === "G" && department.code === operatingCommitteeCode;
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
  operatingCommitteeCode,
}: {
  candidate: Department;
  hierarchyKind: OrganizationHierarchyKind;
  level: 1 | 2 | 3;
  operatingCommitteeCode: string;
}) {
  if (hierarchyKind === "M" && level === 1) return isOperatingCommittee(candidate, operatingCommitteeCode);
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

export function positionCodeSuffix(
  code: string,
  codeConfig?: OrganizationCodeConfig | null,
) {
  const normalized = String(code || "").trim();
  const separator = codeConfig?.position.separator;
  const tail = separator
    ? normalized.split(separator).pop() || ""
    : normalized.match(/(\d+)$/)?.[1] ?? "";
  const digits = tail.replace(/\D/g, "");
  if (!codeConfig) return digits;
  return digits
    .slice(0, codeConfig.position.sequenceLength)
    .padStart(codeConfig.position.sequenceLength, "0");
}

export function positionCodePrefix(
  department: Department | undefined,
  codeConfig: OrganizationCodeConfig,
) {
  const { prefix, separator } = codeConfig.position;
  return department?.code ? `${prefix}${separator}${department.code}${separator}` : "";
}

export function positionCodePrefixFromCode(
  code: string,
  codeConfig?: OrganizationCodeConfig | null,
) {
  const suffix = positionCodeSuffix(code, codeConfig);
  return suffix ? code.slice(0, -suffix.length) : "";
}

export function composePositionCode(
  department: Department | undefined,
  suffix: string,
  fallbackCode: string,
  codeConfig: OrganizationCodeConfig,
) {
  const cleanSuffix = suffix.replace(/\D/g, "").slice(0, codeConfig.position.sequenceLength);
  const prefix = positionCodePrefix(department, codeConfig);
  if (!prefix) return fallbackCode;
  return `${prefix}${cleanSuffix}`;
}

export function usedDepartmentPrefixes(
  departments: Department[],
  codeConfig: OrganizationCodeConfig,
) {
  const rule = codeConfig.department;
  return new Set(departments
    .map((department) => department.code.slice(0, rule.identifierLength))
    .filter((prefix) => isDepartmentIdentifier(prefix, rule)));
}

export function nextGeneratedDepartmentPrefix(
  departments: Department[],
  codeConfig: OrganizationCodeConfig,
) {
  const used = usedDepartmentPrefixes(departments, codeConfig);
  const preferred = codeConfig.department.functionalPrefix;
  if (isDepartmentIdentifier(preferred, codeConfig.department) && !used.has(preferred)) return preferred;
  const alphabet = codeConfig.department.identifierFormat === "uppercaseAlphanumeric"
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let sequence = 0; sequence < 10_000; sequence += 1) {
    let value = sequence;
    let candidate = "";
    for (let index = 0; index < codeConfig.department.identifierLength; index += 1) {
      candidate = alphabet[value % alphabet.length] + candidate;
      value = Math.floor(value / alphabet.length);
    }
    if (!used.has(candidate)) return candidate;
  }
  return "";
}

export function normalizeDepartmentCodeInput(
  level: CreateDepartmentDraft["level"],
  value: string,
  hierarchyKind: OrganizationHierarchyKind,
  codeConfig: OrganizationCodeConfig,
) {
  if (hierarchyKind === "G" || level === 1) {
    return normalizeDepartmentIdentifier(value, codeConfig.department);
  }
  if (level === 2) return value.replace(/\D/g, "").slice(0, codeConfig.department.level2SequenceLength);
  return value.replace(/\D/g, "").slice(0, codeConfig.department.level3SequenceLength);
}

export function departmentCodePrefix(
  department: Department | undefined,
  codeConfig: OrganizationCodeConfig,
) {
  const prefix = department?.code.slice(0, codeConfig.department.identifierLength) || "";
  return isDepartmentIdentifier(prefix, codeConfig.department) ? prefix : "";
}

export function departmentCodeNumber(
  department: Department | undefined,
  codeConfig: OrganizationCodeConfig,
) {
  const code = department?.code ?? "";
  const start = codeConfig.department.identifierLength;
  if (code.slice(start, start + codeConfig.department.separator.length) !== codeConfig.department.separator) {
    return "";
  }
  const suffix = code.slice(start + codeConfig.department.separator.length);
  return /^\d+$/.test(suffix) ? suffix : "";
}

export function suggestDepartmentCodeInput(
  draft: CreateDepartmentDraft,
  departments: Department[],
  codeConfig: OrganizationCodeConfig,
) {
  if (draft.hierarchyKind === "G") {
    return nextGeneratedDepartmentPrefix(departments, codeConfig);
  }
  if (draft.level === 1) {
    return nextGeneratedDepartmentPrefix(departments, codeConfig);
  }
  const parent = departments.find((department) => department.id === draft.parentId);
  if (!parent) return "";
  const prefix = departmentCodePrefix(parent, codeConfig);
  if (!prefix) return "";
  const usedCodes = new Set(departments.map((department) => department.code));
  if (draft.level === 2) {
    const maximum = (10 ** codeConfig.department.level2SequenceLength) - 1;
    for (let number = 1; number <= maximum; number += 1) {
      const suffix = `${number}${codeConfig.department.level2Suffix}`;
      if (!usedCodes.has(`${prefix}${codeConfig.department.separator}${suffix}`)) return String(number);
    }
    return "";
  }
  const parentNumber = departmentCodeNumber(parent, codeConfig);
  const level2Suffix = codeConfig.department.level2Suffix;
  if (!parentNumber || !parentNumber.endsWith(level2Suffix)) return "";
  const stem = parentNumber.slice(0, -level2Suffix.length);
  const maximum = (10 ** codeConfig.department.level3SequenceLength) - 1;
  for (let number = 1; number <= maximum; number += 1) {
    const tail = String(number).padStart(codeConfig.department.level3SequenceLength, "0");
    const suffix = `${stem}${tail}`;
    if (!usedCodes.has(`${prefix}${codeConfig.department.separator}${suffix}`)) return tail;
  }
  return "";
}

export function composeDepartmentCode(
  draft: CreateDepartmentDraft,
  departments: Department[],
  codeConfig: OrganizationCodeConfig,
) {
  const codeInput = draft.code.trim();
  if (draft.hierarchyKind === "G") return isDepartmentIdentifier(codeInput, codeConfig.department) ? codeInput : "";
  if (draft.level === 1) return isDepartmentIdentifier(codeInput, codeConfig.department)
    ? `${codeInput}${codeConfig.department.separator}${codeConfig.department.managementRootSuffix}`
    : "";
  const parent = departments.find((department) => department.id === draft.parentId);
  const prefix = departmentCodePrefix(parent, codeConfig);
  if (!prefix || !/^\d+$/.test(codeInput)) return "";
  if (draft.level === 2) return `${prefix}${codeConfig.department.separator}${Number(codeInput)}${codeConfig.department.level2Suffix}`;
  const parentNumber = departmentCodeNumber(parent, codeConfig);
  const level2Suffix = codeConfig.department.level2Suffix;
  if (!parentNumber || !parentNumber.endsWith(level2Suffix)) return "";
  return `${prefix}${codeConfig.department.separator}${parentNumber.slice(0, -level2Suffix.length)}${codeInput.padStart(codeConfig.department.level3SequenceLength, "0")}`;
}

function departmentCodeExists(code: string, departments: Department[], exceptDepartmentId?: number) {
  return departments.some((department) => department.id !== exceptDepartmentId && department.code === code);
}

function departmentCodeSegmentForLevel(
  code: string,
  level: CreateDepartmentDraft["level"],
  hierarchyKind: OrganizationHierarchyKind,
  codeConfig: OrganizationCodeConfig,
) {
  if (hierarchyKind === "G") {
    const prefix = code.slice(0, codeConfig.department.identifierLength);
    return isDepartmentIdentifier(prefix, codeConfig.department) ? prefix : "";
  }
  if (level === 1) {
    const prefix = code.slice(0, codeConfig.department.identifierLength);
    return isDepartmentIdentifier(prefix, codeConfig.department) ? prefix : "";
  }
  if (level === 2) {
    const segment = code
      .slice(
        codeConfig.department.identifierLength + codeConfig.department.separator.length,
        -codeConfig.department.level2Suffix.length,
      )
      .replace(/\D/g, "");
    return /^[1-9]\d*$/.test(segment) ? segment : "";
  }
  const sequenceLength = codeConfig.department.level3SequenceLength;
  const tail = code.slice(-sequenceLength).replace(/\D/g, "");
  const tailNumber = Number(tail);
  const maximum = (10 ** sequenceLength) - 1;
  return tailNumber >= 1 && tailNumber <= maximum
    ? tail.padStart(sequenceLength, "0")
    : "";
}

export function rebaseDepartmentCodeForParentChange({
  code,
  departmentId,
  level,
  hierarchyKind,
  parentId,
  departments,
  codeConfig,
}: {
  code: string;
  departmentId: number;
  level: CreateDepartmentDraft["level"];
  hierarchyKind: OrganizationHierarchyKind;
  parentId: number | null;
  departments: Department[];
  codeConfig: OrganizationCodeConfig;
}) {
  const segment = departmentCodeSegmentForLevel(code, level, hierarchyKind, codeConfig);
  const draft = { hierarchyKind, level, parentId, code: segment, name: "" };
  const candidate = composeDepartmentCode(draft, departments, codeConfig);
  if (candidate && !departmentCodeExists(candidate, departments, departmentId)) return candidate;

  const suggestion = suggestDepartmentCodeInput({ ...draft, code: "" }, departments, codeConfig);
  const fallback = composeDepartmentCode({ ...draft, code: suggestion }, departments, codeConfig);
  if (fallback && !departmentCodeExists(fallback, departments, departmentId)) return fallback;
  return candidate || code;
}

export function departmentCodeError(
  draft: CreateDepartmentDraft,
  departments: Department[],
  codeConfig: OrganizationCodeConfig,
) {
  const codeInput = draft.code.trim();
  if (draft.hierarchyKind === "G") {
    if (!isDepartmentIdentifier(codeInput, codeConfig.department)) return `${organizationLevelCode(draft)} 编码不符合组织简称规则。`;
    if (draft.level > 1) {
      const parent = departments.find((department) => department.id === draft.parentId);
      if (!parent) return `${organizationLevelCode(draft)} 组织必须选择上级组织。`;
      if (parent.hierarchyKind !== "G" || parent.level !== draft.level - 1) return `${organizationLevelCode(draft)} 组织只能挂在 G${draft.level - 1} 组织下。`;
    }
  } else if (draft.level === 1) {
    if (!isDepartmentIdentifier(codeInput, codeConfig.department)) return "M1 编码不符合组织简称规则。";
    const parent = departments.find((department) => department.id === draft.parentId);
    if (!parent || parent.hierarchyKind !== "G") return "M1 组织上级组织必须选择委员会。";
  } else {
    const parent = departments.find((department) => department.id === draft.parentId);
    if (!parent) return `M${draft.level} 组织必须选择上级组织。`;
    if (parent.hierarchyKind !== "M" || parent.level !== draft.level - 1) return `M${draft.level} 组织只能挂在 M${draft.level - 1} 组织下。`;
    if (!/^\d+$/.test(codeInput)) return `M${draft.level} 编码必须是纯数字。`;
    if (draft.level === 2) {
      if (
        Number(codeInput) < 1
        || codeInput.length > codeConfig.department.level2SequenceLength
      ) {
        return `M2 编码必须是最多 ${codeConfig.department.level2SequenceLength} 位正整数，系统会自动补 ${codeConfig.department.level2Suffix}。`;
      }
    } else {
      const parentNumber = departmentCodeNumber(parent, codeConfig);
      if (!parentNumber || !parentNumber.endsWith(codeConfig.department.level2Suffix)) return "上级 M2 编码不合法。";
      const maximum = (10 ** codeConfig.department.level3SequenceLength) - 1;
      if (codeInput.length < 1 || codeInput.length > codeConfig.department.level3SequenceLength || Number(codeInput) < 1 || Number(codeInput) > maximum) {
        return `M3 编码输入 ${codeConfig.department.level3SequenceLength} 位流水。`;
      }
    }
  }
  const fullCode = composeDepartmentCode(draft, departments, codeConfig);
  if (!fullCode) return "组织编码不合法。";
  if (departments.some((department) => department.code === fullCode)) return "组织编码已存在。";
  return "";
}

export function departmentCodeAffixes(
  draft: CreateDepartmentDraft,
  departments: Department[],
  codeConfig: OrganizationCodeConfig,
) {
  if (draft.hierarchyKind === "G") return { prefix: "", suffix: "" };
  if (draft.level === 1) return {
    prefix: "",
    suffix: `${codeConfig.department.separator}${codeConfig.department.managementRootSuffix}`,
  };
  const parent = departments.find((department) => department.id === draft.parentId);
  const prefix = departmentCodePrefix(parent, codeConfig);
  if (draft.level === 2) return {
    prefix: `${prefix}${codeConfig.department.separator}`,
    suffix: codeConfig.department.level2Suffix,
  };
  const parentNumber = departmentCodeNumber(parent, codeConfig);
  return {
    prefix: parentNumber
      ? `${prefix}${codeConfig.department.separator}${parentNumber.slice(0, -codeConfig.department.level2Suffix.length)}`
      : `${prefix}${codeConfig.department.separator}`,
    suffix: "",
  };
}

export function generatePositionCode(
  department: Department | undefined,
  positions: Position[],
  codeConfig: OrganizationCodeConfig,
) {
  const prefix = positionCodePrefix(department, codeConfig);
  if (!prefix) return "";
  const usedCodes = new Set(positions.map((position) => position.code));
  const maximum = (10 ** codeConfig.position.sequenceLength) - 1;
  for (let number = codeConfig.position.sequenceStart; number <= maximum; number += 1) {
    const code = `${prefix}${String(number).padStart(codeConfig.position.sequenceLength, "0")}`;
    if (!usedCodes.has(code)) return code;
  }
  return "";
}

export function plannedHeadcount(position: Pick<Position, "headcountPlan">) {
  return typeof position.headcountPlan === "number" && Number.isFinite(position.headcountPlan)
    ? Math.max(0, position.headcountPlan)
    : 0;
}
