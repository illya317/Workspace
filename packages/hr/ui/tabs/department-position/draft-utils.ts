import type {
  Department,
  DepartmentDescription,
  DepartmentDescriptionDraft,
  DepartmentDraft,
  DescriptionDraft,
  Position,
  PositionDraft,
} from "./types";
import { parseDetailsObject } from "./description-details";
import { parseAlias, serializeAlias } from "./utils";

export function normalizeDateValue(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let year: number;
  let month: number;
  let day: number;
  const yearFirst = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  const dayFirst = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (yearFirst) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[2]);
    day = Number(yearFirst[3]);
  } else if (dayFirst) {
    year = Number(dayFirst[3]);
    month = Number(dayFirst[2]);
    day = Number(dayFirst[1]);
  } else {
    return "";
  }
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function versionNumber(value: unknown) {
  const match = String(value || "").trim().match(/\d+/);
  return match ? Number(match[0]) : -1;
}

export function formatHistoryVersion(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function parseChangeHistory(details: string) {
  const parsed = parseDetailsObject(details);
  const records = parsed && Array.isArray(parsed.changeHistory) ? parsed.changeHistory : [];
  return records.filter((record): record is Record<string, unknown> => !!record && typeof record === "object" && !Array.isArray(record));
}

function latestChangeHistory(records: Array<Record<string, unknown>>) {
  return [...records].sort((a, b) => {
    const versionDelta = versionNumber(b.version) - versionNumber(a.version);
    if (versionDelta !== 0) return versionDelta;
    const dateA = normalizeDateValue(a.effectiveDate);
    const dateB = normalizeDateValue(b.effectiveDate);
    if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    return 0;
  })[0];
}

export function deriveDescriptionMeta(details: string, fallbackVersion: string, fallbackEffectiveDate: string) {
  const latest = latestChangeHistory(parseChangeHistory(details));
  return {
    version: String(latest?.version || fallbackVersion || ""),
    effectiveDate: normalizeDateValue(latest?.effectiveDate) || normalizeDateValue(fallbackEffectiveDate) || "",
  };
}

export function createDraft(position: Position): PositionDraft {
  return {
    id: position.id,
    code: position.code,
    name: position.name,
    alias: parseAlias(position.alias),
    departmentId: position.departmentId,
    positionDescriptionId: position.positionDescriptionId,
  };
}

export function createDescriptionDraft(position: Position): DescriptionDraft | null {
  if (!position.positionDescriptionId) return null;
  return {
    id: position.positionDescriptionId,
    code: position.positionDescriptionCode || "",
    name: position.positionDescriptionName || "",
    departmentName: position.positionDescriptionDepartmentName || "",
    reportTo: position.reportTo || "",
    positionPurpose: position.positionPurpose || "",
    summary: position.summary || "",
    headcount: position.headcountPlan === null || position.headcountPlan === undefined ? "" : String(position.headcountPlan),
    version: position.version || "",
    effectiveDate: position.effectiveDate || "",
    sourceFile: position.sourceFile || "",
    details: JSON.stringify(position.positionDescriptionDetails || {}, null, 2),
  };
}

export function createDepartmentDescriptionDraft(department: Department, description?: DepartmentDescription): DepartmentDescriptionDraft {
  return {
    id: description?.id || null,
    code: description?.code || department.code,
    name: description?.name || department.name,
    sourceFile: description?.sourceFile || "",
    codeRaw: description?.codeRaw || "",
    details: JSON.stringify(description?.details || {}, null, 2),
  };
}

export function departmentManagerPositionName(department: Department) {
  const details = department.descriptions[0]?.details;
  const basic = details?.["基本信息"];
  if (!basic || typeof basic !== "object" || Array.isArray(basic)) return "";
  const raw = (basic as Record<string, unknown>)["负责人"] ?? (basic as Record<string, unknown>)["主管领导"];
  return typeof raw === "string" ? raw : "";
}

export function createDepartmentDraft(department: Department): DepartmentDraft {
  return {
    id: department.id,
    name: department.name,
    alias: parseAlias(department.alias),
    managerPositionName: departmentManagerPositionName(department),
  };
}

export function draftPayload(draft: PositionDraft) {
  return {
    id: draft.id,
    code: draft.code.trim(),
    name: draft.name.trim(),
    alias: serializeAlias(draft.alias || ""),
    departmentId: draft.departmentId,
    positionDescriptionId: draft.positionDescriptionId,
  };
}

export function normalizeDraftForCompare(draft: PositionDraft) {
  return JSON.stringify(draftPayload(draft));
}

export function normalizePositionForCompare(position: Position) {
  return JSON.stringify({
    id: position.id,
    code: position.code,
    name: position.name,
    alias: position.alias || null,
    departmentId: position.departmentId,
    positionDescriptionId: position.positionDescriptionId,
  });
}

export function descriptionPayload(draft: DescriptionDraft) {
  const meta = deriveDescriptionMeta(draft.details, draft.version, draft.effectiveDate);
  return {
    id: draft.id,
    code: draft.code.trim(),
    name: draft.name.trim(),
    departmentName: draft.departmentName.trim() || null,
    reportTo: draft.reportTo.trim() || null,
    positionPurpose: draft.positionPurpose.trim() || null,
    summary: draft.summary.trim() || null,
    headcount: draft.headcount.trim() || null,
    version: meta.version.trim() || null,
    effectiveDate: meta.effectiveDate.trim() || null,
    sourceFile: draft.sourceFile.trim(),
    details: draft.details.trim() || null,
  };
}

export function isPositiveIntegerText(value: string) {
  return /^[1-9]\d*$/.test(value.trim());
}

export function departmentDescriptionPayload(draft: DepartmentDescriptionDraft) {
  return {
    id: draft.id,
    code: draft.code.trim(),
    name: draft.name.trim(),
    sourceFile: draft.sourceFile.trim(),
    codeRaw: draft.codeRaw.trim() || null,
    details: draft.details.trim() || null,
  };
}

export function sanitizeDepartmentDescriptionDetails(details: string, departmentName: string, managerPositionName: string) {
  const parsed = parseDetailsObject(details);
  if (!parsed) return details;
  const basic = parsed["基本信息"] && typeof parsed["基本信息"] === "object" && !Array.isArray(parsed["基本信息"])
    ? parsed["基本信息"] as Record<string, unknown>
    : {};
  const {
    "主管领导": _legacySupervisor,
    "岗位编制": _legacyHeadcount,
    "定编岗位": _legacyFixedPositions,
    ...restBasic
  } = basic;
  return JSON.stringify({
    ...parsed,
    "基本信息": {
      ...restBasic,
      "部门名称": departmentName,
      "负责人": managerPositionName.trim() || "",
    },
  }, null, 2);
}

export function departmentDraftPayload(draft: DepartmentDraft) {
  return {
    id: draft.id,
    name: draft.name.trim(),
    alias: serializeAlias(draft.alias || ""),
    managerPositionName: draft.managerPositionName.trim(),
  };
}

export function normalizeDescriptionForCompare(draft: DescriptionDraft | null) {
  return draft ? JSON.stringify(descriptionPayload(draft)) : "";
}

export function normalizePositionDescriptionForCompare(position: Position) {
  const draft = createDescriptionDraft(position);
  return normalizeDescriptionForCompare(draft);
}

export function normalizeDepartmentDescriptionsForCompare(drafts: DepartmentDescriptionDraft[] | null) {
  return JSON.stringify((drafts || []).slice(0, 1).map(departmentDescriptionPayload));
}

export function normalizeDepartmentDescriptionSourceForCompare(department: Department) {
  const source = department.descriptions[0]
    ? [createDepartmentDescriptionDraft(department, department.descriptions[0])]
    : [createDepartmentDescriptionDraft(department)];
  return normalizeDepartmentDescriptionsForCompare(source);
}
