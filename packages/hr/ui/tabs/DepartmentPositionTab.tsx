"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArchiveSelectorPanel,
  ActionButton,
  type ArchiveSelectorItem,
  EmptyStateCard,
  HierarchyBadge,
  InlineCreatePanel,
  PanelCard,
  SearchInput,
  SelectField,
  SplitWorkspace,
  SplitWorkspaceToolbar,
  TextField,
  Toast,
  TreeNodeBranch,
  TreeNodeCard,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
  getTagInputShellClassName,
  getTagPillClassName,
  getToolbarActionClassName,
} from "@workspace/core/ui";
import { useConfirmDelete } from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import EntitySearchInput, { type SearchOption } from "../components/EntitySearchInput";
import OptionPicker, { type PickerOption } from "../components/OptionPicker";
import RankPicker from "../components/RankPicker";
import { workspacePath } from "@workspace/core/routing";
import { type HRUser, hrCanEdit } from "@workspace/hr/types";
import {
  HR_OFFICE_LOCATIONS,
  HR_RANKS,
  getHrMajorPickerOptions,
  getHrMajorPickerValue,
  normalizeHrMajorItems,
  parseHrMajorPickerValue,
  type HRMajorItem,
} from "@workspace/hr/constants/field-options";
import { matchText } from "@workspace/core/search";

type Department = {
  id: number;
  code: string;
  name: string;
  alias: string | null;
  level: number;
  parentId: number | null;
  parentName: string | null;
  managerUserId: number | null;
  managerName: string | null;
  headcount: number;
  isArchived: boolean;
  archivedAt: string | null;
  children: { id: number; name: string }[];
  descriptions: DepartmentDescription[];
};

type PositionDetails = Record<string, unknown>;

type DepartmentDescription = {
  id: number;
  code: string;
  name: string;
  sourceFile: string;
  codeRaw: string | null;
  details: Record<string, unknown> | null;
};

type Position = {
  id: number;
  code: string;
  codeRaw: string | null;
  name: string;
  alias: string | null;
  departmentId: number | null;
  departmentName: string | null;
  positionDescriptionId: number | null;
  positionDescriptionName: string | null;
  positionDescriptionCode: string | null;
  positionDescriptionDepartmentName: string | null;
  positionDescriptionDetails: PositionDetails | null;
  reportTo: string | null;
  summary: string | null;
  positionPurpose: string | null;
  headcountPlan: number | null;
  version: string | null;
  effectiveDate: string | null;
  sourceFile: string | null;
  headcount: number;
  isArchived: boolean;
  archivedAt: string | null;
};

type DepartmentPositionStats = {
  directPositions: number;
  totalPositions: number;
  directHeadcount: number;
  totalHeadcount: number;
};

type Selection =
  | { type: "department"; id: number }
  | { type: "position"; id: number }
  | null;

type PositionDraft = Pick<
  Position,
  "id" | "code" | "name" | "alias" | "departmentId" | "positionDescriptionId"
>;

type DescriptionDraft = {
  id: number;
  code: string;
  name: string;
  departmentName: string;
  reportTo: string;
  positionPurpose: string;
  summary: string;
  headcount: string;
  version: string;
  effectiveDate: string;
  sourceFile: string;
  details: string;
};

type DepartmentDescriptionDraft = {
  id: number | null;
  code: string;
  name: string;
  sourceFile: string;
  codeRaw: string;
  details: string;
};

type DepartmentDraft = {
  id: number;
  name: string;
  alias: string;
  managerPositionName: string;
};

type CreateDepartmentDraft = {
  level: 1 | 2 | 3;
  parentId: number | null;
  code: string;
  name: string;
};

type CreatePositionDraft = {
  departmentId: number | null;
  name: string;
};

type DepartmentPositionMode = "organization" | "position";
type ArchivedEntityTab = "departments" | "positions";

const formInputClassName = getFieldInputClassName();
const compactFormInputClassName = getFieldInputClassName("h-10 py-0");
const readOnlyInputClassName = getReadOnlyFieldClassName("h-10 py-0");
const compactReadOnlyInputClassName = getReadOnlyFieldClassName();
const tagInputShellClassName = getTagInputShellClassName("content-start");
const tagPillClassName = getTagPillClassName();
const smallSecondaryActionClassName = getToolbarActionClassName("secondary").replace("px-4 py-2", "px-2 py-1").replace("text-sm", "text-xs");

function parseAlias(alias: string | null) {
  if (!alias) return "";
  try {
    const parsed = JSON.parse(alias);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join("、");
  } catch {}
  return alias;
}

function splitAliasText(value: string) {
  return [...new Set(value.split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function serializeAlias(value: string) {
  const items = splitAliasText(value);
  return items.length > 0 ? JSON.stringify([...new Set(items)]) : null;
}

function PositionAliasTagsInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const [draft, setDraft] = useState("");
  const tags = useMemo(() => splitAliasText(value), [value]);

  function commitDraft() {
    const nextTags = splitAliasText(draft);
    if (nextTags.length === 0) return;
    onChange([...tags, ...nextTags].join("、"));
    setDraft("");
  }

  async function removeTag(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除别名「${tags[index]}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(tags.filter((_, tagIndex) => tagIndex !== index).join("、"));
  }

  return (
    <div className={tagInputShellClassName}>
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className={tagPillClassName}
        >
          <span className="truncate">{tag}</span>
          {!disabled && (
            <ActionButton
              aria-label={`删除别名 ${tag}`}
              onClick={() => void removeTag(index)}
              className="grid size-4 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-900"
            >
              ×
            </ActionButton>
          )}
        </span>
      ))}
      {disabled ? (
        tags.length === 0 ? <span className="text-slate-400">未设置</span> : null
      ) : (
        <TextField
          value={draft}
          onChange={setDraft}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === "，" || event.key === "、") {
              if (draft.trim()) {
                event.preventDefault();
                commitDraft();
              }
            }
            if (event.key === "Backspace" && !draft && tags.length > 0) {
              void removeTag(tags.length - 1);
            }
          }}
          placeholder={tags.length === 0 ? "添加别名" : ""}
          unstyled
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      )}
    </div>
  );
}

function sectionTitle(title: string, extra?: ReactNode) {
  return (
    <div className="mb-3 flex items-center gap-3 border-b border-slate-200 pb-2">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      {extra}
    </div>
  );
}

function DetailStatsRow({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <PanelCard className="md:col-span-2" bodyClassName="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="inline-flex items-baseline gap-2">
            <span className="text-xs font-medium text-slate-500">{item.label}</span>
            <span className="text-sm font-semibold text-slate-900">{item.value}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

function departmentPath(department: Department | undefined, departmentById: Map<number, Department>) {
  if (!department) return "";
  const parts: string[] = [];
  let current: Department | undefined = department;
  const guard = new Set<number>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    parts.unshift(current.name);
    current = current.parentId ? departmentById.get(current.parentId) : undefined;
  }
  return parts.join(" / ");
}

function departmentParentPath(department: Department | undefined, departmentById: Map<number, Department>) {
  if (!department?.parentId) return "";
  return departmentPath(departmentById.get(department.parentId), departmentById);
}

function archiveTimestamp(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatArchiveTime(value: string | null) {
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

function shortPositionCode(code: string) {
  const parts = code.split("-");
  return parts[parts.length - 1] || code;
}

function positionCodeSuffix(code: string) {
  const match = String(code || "").trim().match(/-(\d{1,2})$/);
  if (match) return match[1];
  const tail = String(code || "").trim().split("-").pop() || "";
  const digits = tail.replace(/\D/g, "").slice(0, 2);
  return digits ? digits.padStart(2, "0") : "";
}

function positionCodePrefix(department: Department | undefined) {
  return department?.code ? `GW-${department.code}-` : "";
}

function positionCodePrefixFromCode(code: string) {
  const suffix = positionCodeSuffix(code);
  return suffix ? code.slice(0, -suffix.length) : "";
}

function composePositionCode(department: Department | undefined, suffix: string, fallbackCode: string) {
  const cleanSuffix = suffix.replace(/\D/g, "").slice(0, 2);
  const prefix = positionCodePrefix(department);
  if (!prefix) return fallbackCode;
  return `${prefix}${cleanSuffix}`;
}

function usedDepartmentPrefixes(departments: Department[]) {
  return new Set(departments.map((department) => department.code.slice(0, 3)).filter((prefix) => /^[A-Z]{3}$/.test(prefix)));
}

function nextGeneratedDepartmentPrefix(departments: Department[]) {
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

function normalizeDepartmentCodeInput(level: CreateDepartmentDraft["level"], value: string) {
  if (level === 1) return value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3);
  if (level === 2) return value.replace(/\D/g, "").slice(0, 4);
  return value.replace(/\D/g, "").slice(0, 2);
}

function departmentCodePrefix(department: Department | undefined) {
  const prefix = department?.code.slice(0, 3) || "";
  return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
}

function departmentCodeNumber(department: Department | undefined) {
  const suffix = department?.code.slice(3) || "";
  return /^\d+$/.test(suffix) ? suffix : "";
}

function suggestDepartmentCodeInput(draft: CreateDepartmentDraft, departments: Department[]) {
  if (draft.level === 1) {
    return nextGeneratedDepartmentPrefix(departments);
  }
  const parent = departments.find((department) => department.id === draft.parentId);
  if (!parent) return "";
  const prefix = departmentCodePrefix(parent);
  if (!prefix) return "";
  const usedCodes = new Set(departments.map((department) => department.code));
  if (draft.level === 2) {
    for (let number = 1; number <= 99; number += 1) {
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

function composeDepartmentCode(draft: CreateDepartmentDraft, departments: Department[]) {
  const codeInput = draft.code.trim();
  if (draft.level === 1) return /^[A-Z]{3}$/.test(codeInput) ? `${codeInput}001` : "";
  const parent = departments.find((department) => department.id === draft.parentId);
  const prefix = departmentCodePrefix(parent);
  if (!prefix || !/^\d+$/.test(codeInput)) return "";
  if (draft.level === 2) return `${prefix}${Number(codeInput)}00`;
  const parentNumber = departmentCodeNumber(parent);
  if (!parentNumber || !parentNumber.endsWith("00")) return "";
  return `${prefix}${parentNumber.slice(0, -2)}${codeInput.padStart(2, "0")}`;
}

function departmentCodeError(draft: CreateDepartmentDraft, departments: Department[]) {
  const codeInput = draft.code.trim();
  if (draft.level === 1) {
    if (!/^[A-Z]{3}$/.test(codeInput)) return "L1 编码必须是 3 位大写字母。";
  } else {
    const parent = departments.find((department) => department.id === draft.parentId);
    if (!parent) return `L${draft.level} 部门必须选择上级部门。`;
    if (!/^\d+$/.test(codeInput)) return `L${draft.level} 编码必须是纯数字。`;
    if (draft.level === 2) {
      if (Number(codeInput) < 1) return "L2 编码必须是正整数，系统会自动补 00。";
    } else {
      const parentNumber = departmentCodeNumber(parent);
      if (!parentNumber || !parentNumber.endsWith("00")) return "上级 L2 编码不合法。";
      if (codeInput.length < 1 || codeInput.length > 2 || Number(codeInput) < 1) return "L3 编码只输入最后两位，范围 01-99。";
    }
  }
  const fullCode = composeDepartmentCode(draft, departments);
  if (!fullCode) return "部门编码不合法。";
  if (departments.some((department) => department.code === fullCode)) return "部门编码已存在。";
  return "";
}

function departmentCodePlaceholder(level: CreateDepartmentDraft["level"]) {
  if (level === 1) return "ABC";
  if (level === 2) return "1";
  return "01";
}

function departmentCodeAffixes(draft: CreateDepartmentDraft, departments: Department[]) {
  if (draft.level === 1) return { prefix: "", suffix: "001" };
  const parent = departments.find((department) => department.id === draft.parentId);
  const prefix = departmentCodePrefix(parent);
  if (draft.level === 2) return { prefix, suffix: "00" };
  const parentNumber = departmentCodeNumber(parent);
  return { prefix: parentNumber ? `${prefix}${parentNumber.slice(0, -2)}` : prefix, suffix: "" };
}

function generatePositionCode(department: Department | undefined, positions: Position[]) {
  const prefix = positionCodePrefix(department);
  if (!prefix) return "";
  const usedCodes = new Set(positions.map((position) => position.code));
  for (let number = 1; number <= 99; number += 1) {
    const code = `${prefix}${String(number).padStart(2, "0")}`;
    if (!usedCodes.has(code)) return code;
  }
  return "";
}

function plannedHeadcount(position: Pick<Position, "headcountPlan">) {
  return typeof position.headcountPlan === "number" && Number.isFinite(position.headcountPlan)
    ? Math.max(0, position.headcountPlan)
    : 0;
}

function normalizeDateValue(value: unknown) {
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

function versionNumber(value: unknown) {
  const match = String(value || "").trim().match(/\d+/);
  return match ? Number(match[0]) : -1;
}

function formatHistoryVersion(value: number) {
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

function deriveDescriptionMeta(details: string, fallbackVersion: string, fallbackEffectiveDate: string) {
  const latest = latestChangeHistory(parseChangeHistory(details));
  return {
    version: String(latest?.version || fallbackVersion || ""),
    effectiveDate: normalizeDateValue(latest?.effectiveDate) || normalizeDateValue(fallbackEffectiveDate) || "",
  };
}

function createDraft(position: Position): PositionDraft {
  return {
    id: position.id,
    code: position.code,
    name: position.name,
    alias: parseAlias(position.alias),
    departmentId: position.departmentId,
    positionDescriptionId: position.positionDescriptionId,
  };
}

function createDescriptionDraft(position: Position): DescriptionDraft | null {
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

function createDepartmentDescriptionDraft(department: Department, description?: DepartmentDescription): DepartmentDescriptionDraft {
  return {
    id: description?.id || null,
    code: description?.code || department.code,
    name: description?.name || department.name,
    sourceFile: description?.sourceFile || "",
    codeRaw: description?.codeRaw || "",
    details: JSON.stringify(description?.details || {}, null, 2),
  };
}

function departmentManagerPositionName(department: Department) {
  const details = department.descriptions[0]?.details;
  const basic = details?.["基本信息"];
  if (!basic || typeof basic !== "object" || Array.isArray(basic)) return "";
  const raw = (basic as Record<string, unknown>)["负责人"] ?? (basic as Record<string, unknown>)["主管领导"];
  return typeof raw === "string" ? raw : "";
}

function createDepartmentDraft(department: Department): DepartmentDraft {
  return {
    id: department.id,
    name: department.name,
    alias: parseAlias(department.alias),
    managerPositionName: departmentManagerPositionName(department),
  };
}

function draftPayload(draft: PositionDraft) {
  return {
    id: draft.id,
    code: draft.code.trim(),
    name: draft.name.trim(),
    alias: serializeAlias(draft.alias || ""),
    departmentId: draft.departmentId,
    positionDescriptionId: draft.positionDescriptionId,
  };
}

function normalizeDraftForCompare(draft: PositionDraft) {
  return JSON.stringify(draftPayload(draft));
}

function normalizePositionForCompare(position: Position) {
  return JSON.stringify({
    id: position.id,
    code: position.code,
    name: position.name,
    alias: position.alias || null,
    departmentId: position.departmentId,
    positionDescriptionId: position.positionDescriptionId,
  });
}

function descriptionPayload(draft: DescriptionDraft) {
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

function isPositiveIntegerText(value: string) {
  return /^[1-9]\d*$/.test(value.trim());
}

function departmentDescriptionPayload(draft: DepartmentDescriptionDraft) {
  return {
    id: draft.id,
    code: draft.code.trim(),
    name: draft.name.trim(),
    sourceFile: draft.sourceFile.trim(),
    codeRaw: draft.codeRaw.trim() || null,
    details: draft.details.trim() || null,
  };
}

function sanitizeDepartmentDescriptionDetails(details: string, departmentName: string, managerPositionName: string) {
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

function departmentDraftPayload(draft: DepartmentDraft) {
  return {
    id: draft.id,
    name: draft.name.trim(),
    alias: serializeAlias(draft.alias || ""),
    managerPositionName: draft.managerPositionName.trim(),
  };
}

const DETAIL_FIELD_ORDER = [
  "code_raw",
  "departmentCode",
  "purpose",
  "scope",
  "subordinates",
  "rank",
  "salaryType",
  "officeLocation",
  "workSchedule",
  "education",
  "major",
  "experienceRequirements",
  "cert",
  "skills",
  "competencies",
  "training",
  "otherRequirements",
  "workEnvironments",
  "equipment",
  "externalCollaboration",
  "distributionDeptNames",
  "trainingPositionNames",
  "drafter",
  "reviewer1",
  "reviewer2",
  "approver",
  "duties",
  "managementDuties",
  "changeHistory",
  "attachments",
];

const DETAIL_FIELD_LABELS: Record<string, string> = {
  code_raw: "原始编码",
  departmentCode: "部门编码",
  purpose: "适用目的",
  scope: "适用范围",
  subordinates: "下属岗位",
  rank: "职级",
  salaryType: "薪酬类型",
  officeLocation: "办公地点",
  workSchedule: "工时制度",
  education: "学历",
  major: "专业",
  experienceRequirements: "经验",
  cert: "证书",
  skills: "技能",
  competencies: "胜任力",
  training: "培训",
  otherRequirements: "其他要求",
  workEnvironments: "工作环境",
  equipment: "设备",
  externalCollaboration: "外部协作",
  distributionDeptNames: "分发部门",
  trainingPositionNames: "培训岗位",
  drafter: "起草",
  reviewer1: "审核1",
  reviewer2: "审核2",
  approver: "批准",
  duties: "主要职责",
  managementDuties: "管理职责",
  changeHistory: "变更历史",
  attachments: "附件",
};

const EDUCATION_REQUIREMENT_OPTIONS = ["博士及以上", "硕士及以上", "本科及以上", "大专及以上", "无要求"];

const HIDDEN_POSITION_DETAIL_KEYS = new Set([
  "code",
  "code_raw",
  "departmentCode",
  "departmentName",
  "documentSource",
  "effectiveDate",
  "headcount",
  "isResearch",
  "name",
  "other",
  "positionPurpose",
  "reportTo",
  "sourceFile",
  "summary",
  "version",
]);

type PositionDescriptionTemplateId = string;
type PositionDescriptionTemplateGroup = "base" | "qualification" | "duties" | "managementDuties" | "flow" | "history" | "rest";

type PositionDescriptionTemplate = {
  id: PositionDescriptionTemplateId;
  label: string;
  groups: PositionDescriptionTemplateGroup[];
  fields?: string[];
  custom?: boolean;
};

const NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION = "__new_position_description_template__";
const POSITION_DESCRIPTION_BASE_DETAIL_KEYS = ["purpose", "scope", "subordinates", "rank", "salaryType", "officeLocation", "workSchedule"];
const POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS = ["education", "major", "experienceRequirements", "cert", "skills", "competencies", "training", "otherRequirements", "workEnvironments", "equipment", "externalCollaboration"];
const POSITION_DESCRIPTION_FLOW_DETAIL_KEYS = ["distributionDeptNames", "trainingPositionNames", "drafter", "reviewer1", "reviewer2", "approver"];

const COMMON_POSITION_DESCRIPTION_TEMPLATE: PositionDescriptionTemplate = {
  label: "常用模板",
  id: "common",
  groups: [],
  fields: [
    "subordinates",
    "rank",
    "salaryType",
    "officeLocation",
    "education",
    "major",
    "experienceRequirements",
    "cert",
    "skills",
    "training",
    "otherRequirements",
    "duties",
  ],
};

const POSITION_DESCRIPTION_DEFAULT_TEMPLATES: PositionDescriptionTemplate[] = [
  COMMON_POSITION_DESCRIPTION_TEMPLATE,
  {
    id: "full",
    label: "完整模板",
    groups: ["base", "qualification", "duties", "managementDuties", "flow", "history", "rest"],
  },
];

const POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS: Array<{ label: string; fields: string[] }> = [
  { label: "说明书基础", fields: POSITION_DESCRIPTION_BASE_DETAIL_KEYS },
  { label: "任职资格", fields: POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS },
  { label: "职责", fields: ["duties", "managementDuties"] },
  { label: "流转审批", fields: POSITION_DESCRIPTION_FLOW_DETAIL_KEYS },
  { label: "变更历史", fields: ["changeHistory"] },
];

function positionDescriptionTemplateFields(template: PositionDescriptionTemplate) {
  if (template.fields) return template.fields;
  const keys: string[] = [];
  if (template.groups.includes("base")) keys.push(...POSITION_DESCRIPTION_BASE_DETAIL_KEYS);
  if (template.groups.includes("qualification")) keys.push(...POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS);
  if (template.groups.includes("duties")) keys.push("duties");
  if (template.groups.includes("managementDuties")) keys.push("managementDuties");
  if (template.groups.includes("flow")) keys.push(...POSITION_DESCRIPTION_FLOW_DETAIL_KEYS);
  if (template.groups.includes("history")) keys.push("changeHistory");
  return keys;
}

function sanitizePositionDescriptionTemplate(input: unknown): PositionDescriptionTemplate | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : "";
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : "";
  const fields = Array.isArray(record.fields)
    ? record.fields.filter((field): field is string => typeof field === "string" && (DETAIL_FIELD_ORDER.includes(field) || field === "managementDuties"))
    : [];
  if (!id || !label || fields.length === 0) return null;
  return { id, label, fields, groups: [], custom: true };
}

function mergePositionDescriptionTemplates(storedTemplates: PositionDescriptionTemplate[]) {
  const byId = new Map<string, PositionDescriptionTemplate>();
  for (const template of POSITION_DESCRIPTION_DEFAULT_TEMPLATES) {
    byId.set(template.id, template);
  }
  for (const template of storedTemplates) {
    if (template.id === "full") continue;
    byId.set(template.id, { ...template, custom: true });
  }
  return Array.from(byId.values());
}

function isDefaultPositionDescriptionTemplate(id: string) {
  return POSITION_DESCRIPTION_DEFAULT_TEMPLATES.some((template) => template.id === id);
}

const POSITION_DETAIL_DEFAULTS: Record<string, unknown> = {
  code_raw: "",
  departmentCode: "",
  purpose: "",
  scope: "",
  subordinates: [],
  rank: "",
  salaryType: "",
  officeLocation: "",
  workSchedule: "",
  education: "",
  major: "",
  experienceRequirements: [],
  cert: "",
  skills: [],
  competencies: [],
  training: "",
  otherRequirements: [],
  workEnvironments: [],
  equipment: [],
  externalCollaboration: [],
  distributionDeptNames: [],
  trainingPositionNames: [],
  drafter: "",
  reviewer1: "",
  reviewer2: "",
  approver: "",
  duties: [],
  managementDuties: [],
  changeHistory: [],
  attachments: [],
};

function cloneDefaultDetailValue(value: unknown) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") return JSON.parse(JSON.stringify(value));
  return value;
}

function normalizePositionDetails(details: Record<string, unknown>) {
  const normalized = { ...details };
  for (const key of DETAIL_FIELD_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = cloneDefaultDetailValue(POSITION_DETAIL_DEFAULTS[key]);
    }
  }
  return normalized;
}

function parseDetailsObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isPrimitiveArray(value: unknown): value is Array<string | number | boolean | null> {
  return Array.isArray(value) && value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
}

function detailValueToText(value: unknown) {
  if (isPrimitiveArray(value)) return value.map((item) => item === null ? "" : String(item)).join("\n");
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return value === null || value === undefined ? "" : String(value);
}

function textToDetailValue(previousValue: unknown, raw: string) {
  if (isPrimitiveArray(previousValue)) return raw.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (typeof previousValue === "number") {
    const next = Number(raw);
    return Number.isFinite(next) ? next : raw;
  }
  if (typeof previousValue === "boolean") return raw === "true" || raw === "是";
  if (previousValue && typeof previousValue === "object") {
    try {
      return JSON.parse(raw || "null");
    } catch {
      return raw;
    }
  }
  return raw;
}

function detailFieldRows(value: unknown) {
  if (value && typeof value === "object" && !isPrimitiveArray(value)) return 8;
  if (isPrimitiveArray(value)) return Math.min(6, Math.max(3, value.length));
  const length = String(value || "").length;
  return length > 60 ? 3 : 1;
}

function normalizeTextItem(value: string) {
  return value.trim().replace(/[\s；;。]+$/g, "");
}

function primitiveListItems(value: unknown) {
  if (isPrimitiveArray(value)) return value.map((item) => normalizeTextItem(item === null ? "" : String(item)));
  if (typeof value === "string") {
    return value
      .split(/\n+|[；;、，,]+/)
      .map(normalizeTextItem)
      .filter(Boolean);
  }
  return [];
}

const SALARY_TYPE_OPTIONS = ["固定薪资", "固定月薪+浮动绩效", "固定薪资+浮动绩效"];
const WORK_SCHEDULE_OPTIONS = ["标准工时工作制", "综合计算工时制", "综合计时工作制", "无固定作息时间"];
const WORK_AREA_OPTIONS = [
  "一般区",
  "有毒区",
  "D级区",
  "无毒区",
  "洁净区",
  "B+A区",
  "GMP洁净车间",
  "C级区",
];
const ENVIRONMENT_FACTOR_OPTIONS = [
  "安静",
  "整洁",
  "玻璃拉伤",
  "高温",
  "噪声",
  "酸碱烫伤",
  "臭氧残留挥发气体",
  "毒种感染",
  "接触强酸强碱",
  "溶液烫伤",
  "高压触电",
  "有机化学溶液",
  "有毒气体",
  "盐酸挥发气体",
  "高危险",
  "震动",
  "电脑辐射",
  "电磁波",
  "粉尘",
  "灯管辐射",
  "湿度大",
  "火焰烫伤",
  "二甲基亚砜挥发",
  "辐射",
  "施工现场",
  "大量有机残留有低毒",
  "烫伤",
  "潮湿",
  "热污染",
];

function pickerOptions(values: string[]): PickerOption[] {
  return values.map((value) => ({ label: value, value }));
}

function selectedEntityName(entity: string, option?: SearchOption) {
  if (!option) return "";
  if (entity === "department") {
    return option.name.split(" / ").pop()?.trim() || option.name;
  }
  return option.name;
}

function EntityValueInput({
  label,
  entity,
  value,
  disabled,
  onChange,
  invalid,
}: {
  label: string;
  entity: string;
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  invalid?: boolean;
}) {
  const current = String(value || "");
  return (
    <label className="space-y-1">
      <span className={`text-xs font-medium ${invalid ? "text-red-500" : "text-slate-500"}`}>{label}</span>
      <EntitySearchInput
        entity={entity}
        value={current}
        displayValue={current}
        disabled={disabled}
        placeholder={`搜索${label}`}
        onChange={(_label, option?: SearchOption) => onChange(selectedEntityName(entity, option) || null)}
      />
      {invalid && <p className="text-xs text-red-500">当前值不是有效引用，请重新选择。</p>}
    </label>
  );
}

function StringListEditor({
  label,
  value,
  disabled,
  onChange,
  placeholder = "新增条目",
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const confirmDelete = useConfirmDelete();
  const [draft, setDraft] = useState("");
  const items = primitiveListItems(value);

  function commitDraft() {
    const nextItems = primitiveListItems(draft);
    if (nextItems.length === 0) return;
    onChange([...items, ...nextItems].filter((item, index, array) => array.indexOf(item) === index));
    setDraft("");
  }

  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除「${items[index] || label}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className={tagInputShellClassName}>
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className={tagPillClassName}
          >
            <span className="truncate">{item}</span>
            {!disabled && (
              <ActionButton
                aria-label={`删除${label} ${item || index + 1}`}
                onClick={() => void removeItem(index)}
                className="grid size-4 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-900"
              >
                ×
              </ActionButton>
            )}
          </span>
        ))}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <TextField
            value={draft}
            onChange={setDraft}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === "，" || event.key === "、") {
                if (draft.trim()) {
                  event.preventDefault();
                  commitDraft();
                }
              }
              if (event.key === "Backspace" && !draft && items.length > 0) {
                void removeItem(items.length - 1);
              }
            }}
            placeholder={items.length === 0 ? placeholder : ""}
            unstyled
            className={`${items.length === 0 ? "min-w-32 flex-1" : "w-6 flex-none"} border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400`}
          />
        )}
      </div>
    </div>
  );
}

function OptionTagListEditor({
  label,
  value,
  options,
  disabled,
  onChange,
  placeholder = "添加选项",
}: {
  label: string;
  value: unknown;
  options: string[];
  disabled?: boolean;
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const confirmDelete = useConfirmDelete();
  const items = primitiveListItems(value);
  const availableOptions = options.filter((option) => !items.includes(option));

  function addOption(next: string | null) {
    if (!next) return;
    onChange([...items, next].filter((item, index, array) => array.indexOf(item) === index));
  }

  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除「${items[index] || label}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className={tagInputShellClassName}>
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className={tagPillClassName}
          >
            <span className="truncate">{item}</span>
            {!disabled && (
              <ActionButton
                aria-label={`删除${label} ${item}`}
                onClick={() => void removeItem(index)}
                className="grid size-4 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-900"
              >
                ×
              </ActionButton>
            )}
          </span>
        ))}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <div className="min-w-40 flex-1">
            <OptionPicker
              value=""
              options={pickerOptions(availableOptions)}
              disabled={disabled || availableOptions.length === 0}
              placeholder={items.length === 0 ? placeholder : "继续添加"}
              searchPlaceholder={`搜索${label}`}
              visibleCount={6}
              onChange={addOption}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type WorkEnvironmentItem = {
  area: string;
  factors: string[];
};

function normalizeWorkEnvironments(value: unknown): WorkEnvironmentItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const area = String(record.area || "").trim();
      if (!area) return null;
      return {
        area,
        factors: primitiveListItems(record.factors),
      };
    })
    .filter((item): item is WorkEnvironmentItem => Boolean(item));
}

function WorkEnvironmentEditor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: WorkEnvironmentItem[]) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const items = normalizeWorkEnvironments(value);
  const usedAreas = new Set(items.map((item) => item.area));
  const availableAreas = WORK_AREA_OPTIONS.filter((area) => !usedAreas.has(area));

  function updateItem(index: number, patch: Partial<WorkEnvironmentItem>) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function addArea(area: string | null) {
    if (!area) return;
    onChange([...items, { area, factors: [] }]);
  }

  async function removeArea(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除工作区域「${items[index]?.area || "未设置"}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <PanelCard bodyClassName="space-y-3 p-3">
        {items.map((item, index) => {
          const areaOptions = [item.area, ...availableAreas].filter((area, areaIndex, array) => array.indexOf(area) === areaIndex);
          return (
            <PanelCard key={`${item.area}-${index}`} bodyClassName="p-3">
              <div className="mb-3 flex items-start gap-3">
                <div className="min-w-48 flex-1">
                  <OptionPicker
                    value={item.area}
                    options={pickerOptions(areaOptions)}
                    disabled={disabled}
                    placeholder="选择工作区域"
                    searchPlaceholder="搜索工作区域"
                    onChange={(next) => updateItem(index, { area: next || "" })}
                  />
                </div>
                {!disabled && (
                  <ActionButton
                    aria-label={`删除工作区域 ${item.area}`}
                    onClick={() => void removeArea(index)}
                    variant="danger"
                    className="grid size-9 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none hover:bg-red-50 hover:text-red-500"
                  >
                    ×
                  </ActionButton>
                )}
              </div>
              <OptionTagListEditor
                label="环境因素"
                value={item.factors}
                options={ENVIRONMENT_FACTOR_OPTIONS}
                disabled={disabled}
                placeholder="添加环境因素"
                onChange={(factors) => updateItem(index, { factors })}
              />
            </PanelCard>
          );
        })}
        {items.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
        {!disabled && (
          <div className="max-w-sm">
            <OptionPicker
              value=""
              options={pickerOptions(availableAreas)}
              disabled={availableAreas.length === 0}
              placeholder="新增工作区域"
              searchPlaceholder="搜索工作区域"
              onChange={addArea}
            />
          </div>
        )}
      </PanelCard>
    </div>
  );
}

type ExperienceRequirementItem = {
  years: string;
  requirement: string;
};

function normalizeExperienceRequirements(value: unknown): ExperienceRequirementItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      return {
        years: String(record.years || "").trim(),
        requirement: String(record.requirement || "").trim(),
      };
    })
    .filter((item): item is ExperienceRequirementItem => Boolean(item && (item.years || item.requirement)));
}

function positiveIntegerText(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "");
  return digits;
}

function MajorRequirementsEditor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: HRMajorItem[]) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const items = normalizeHrMajorItems(value);
  const majorOptions = getHrMajorPickerOptions(items);

  function updateItem(index: number, patch: Partial<HRMajorItem>) {
    onChange(items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return { ...item, ...patch };
    }));
  }

  function addItem() {
    const first = parseHrMajorPickerValue(majorOptions[0]?.value);
    if (!first.specialty) return;
    onChange([...items, first]);
  }

  async function removeItem(index: number) {
    const item = items[index];
    const confirmed = await confirmDelete({
      message: `确定删除专业要求「${item?.category || ""}${item?.specialty ? ` / ${item.specialty}` : ""}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {!disabled && (
          <ActionButton
            onClick={addItem}
            variant="secondary"
            className="px-2 py-1 text-xs"
          >
            新增
          </ActionButton>
        )}
      </div>
      <PanelCard bodyClassName="space-y-2 p-3">
        {items.map((item, index) => (
          <PanelCard key={index} bodyClassName="grid grid-cols-1 gap-2 p-3 md:grid-cols-[minmax(0,1fr)_40px]">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">专业</span>
              <OptionPicker
                value={getHrMajorPickerValue(item)}
                options={majorOptions}
                disabled={disabled}
                placeholder="选择专业"
                searchPlaceholder="搜索专业"
                onChange={(next) => updateItem(index, parseHrMajorPickerValue(next))}
              />
            </label>
            {!disabled && (
              <ActionButton
                aria-label={`删除${label} ${index + 1}`}
                onClick={() => void removeItem(index)}
                variant="danger"
                className="mt-5 grid size-9 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none hover:bg-red-50 hover:text-red-500"
              >
                ×
              </ActionButton>
            )}
          </PanelCard>
        ))}
        {items.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
      </PanelCard>
    </div>
  );
}

function ExperienceRequirementsEditor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: ExperienceRequirementItem[]) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const items = normalizeExperienceRequirements(value);

  function updateItem(index: number, patch: Partial<ExperienceRequirementItem>) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function addItem() {
    onChange([...items, { years: "", requirement: "" }]);
  }

  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除「${items[index]?.requirement || label}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {!disabled && (
          <ActionButton
            onClick={addItem}
            variant="secondary"
            className="px-2 py-1 text-xs"
          >
            新增
          </ActionButton>
        )}
      </div>
      <PanelCard bodyClassName="space-y-2 p-3">
        {items.map((item, index) => (
          <PanelCard key={index} bodyClassName="grid grid-cols-1 gap-2 p-3 md:grid-cols-[150px_minmax(0,1fr)_40px]">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">年限</span>
              <div className="flex overflow-hidden rounded-md border border-slate-300 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                <TextField
                  value={item.years}
                  disabled={disabled}
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(next) => updateItem(index, { years: positiveIntegerText(next) })}
                  unstyled
                  className="w-14 min-w-0 px-3 py-2 text-sm focus:outline-none disabled:bg-slate-100"
                />
                <span className="whitespace-nowrap border-l border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-500">年以上</span>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">要求内容</span>
              <TextField
                value={item.requirement}
                disabled={disabled}
                placeholder="经验要求"
                onChange={(next) => updateItem(index, { requirement: next })}
              />
            </label>
            {!disabled && (
              <ActionButton
                aria-label={`删除${label} ${index + 1}`}
                onClick={() => void removeItem(index)}
                variant="danger"
                className="mt-5 grid size-9 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none hover:bg-red-50 hover:text-red-500"
              >
                ×
              </ActionButton>
            )}
          </PanelCard>
        ))}
        {items.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
      </PanelCard>
    </div>
  );
}

function EntityTagListEditor({
  label,
  value,
  entity,
  disabled,
  onChange,
  validNames,
  placeholder,
}: {
  label: string;
  value: unknown;
  entity: string;
  disabled?: boolean;
  onChange: (items: string[]) => void;
  validNames?: Set<string>;
  placeholder?: string;
}) {
  const confirmDelete = useConfirmDelete();
  const items = primitiveListItems(value);

  function addOption(option?: SearchOption) {
    const next = selectedEntityName(entity, option);
    if (!next) return;
    onChange([...items, next].filter((item, index, array) => array.indexOf(item) === index));
  }

  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除「${items[index] || label}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className={tagInputShellClassName}>
        {items.map((item, index) => {
          const matched = !validNames || validNames.has(item);
          return (
            <span
              key={`${item}-${index}`}
              title={matched ? undefined : "当前主数据中未找到对应记录"}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                matched ? "border-slate-300 bg-white text-slate-800" : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              <span className="truncate">{item}</span>
              {!disabled && (
                <ActionButton
                  aria-label={`删除${label} ${item}`}
                  onClick={() => void removeItem(index)}
                  className={`grid size-4 place-items-center rounded-full border-0 bg-transparent p-0 shadow-none ${
                    matched ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900" : "text-red-500 hover:bg-red-100 hover:text-red-700"
                  }`}
                >
                  ×
                </ActionButton>
              )}
            </span>
          );
        })}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <div className="min-w-40 flex-1">
            <EntitySearchInput
              entity={entity}
              value=""
              displayValue=""
              disabled={disabled}
              placeholder={items.length === 0 ? placeholder || `搜索${label}` : `添加${label}`}
              onChange={(_label, option?: SearchOption) => addOption(option)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SubordinateTagsEditor({
  label,
  value,
  disabled,
  onChange,
  positionNames,
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: string[]) => void;
  positionNames: Set<string>;
}) {
  const confirmDelete = useConfirmDelete();
  const items = primitiveListItems(value);

  function addOption(option?: SearchOption) {
    const next = selectedEntityName("position", option);
    if (!next) return;
    onChange([...items, next].filter((item, index, array) => array.indexOf(item) === index));
  }

  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除下属岗位「${items[index]}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className={tagInputShellClassName}>
        {items.map((item, index) => {
          const matched = item === "无" || positionNames.has(item);
          return (
            <span
              key={`${item}-${index}`}
              title={matched ? undefined : "当前岗位主数据中未找到对应岗位"}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                matched
                  ? "border-slate-300 bg-white text-slate-800"
                  : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              <span className="truncate">{item}</span>
              {!disabled && (
                <ActionButton
                  aria-label={`删除下属岗位 ${item}`}
                  onClick={() => void removeItem(index)}
                  className={`grid size-4 place-items-center rounded-full border-0 bg-transparent p-0 shadow-none ${
                    matched ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900" : "text-red-500 hover:bg-red-100 hover:text-red-700"
                  }`}
                >
                  ×
                </ActionButton>
              )}
            </span>
          );
        })}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <div className="min-w-40 flex-1">
            <EntitySearchInput
              entity="position"
              value=""
              displayValue=""
              disabled={disabled}
              placeholder={items.length === 0 ? "搜索下属岗位" : "添加下属岗位"}
              onChange={(_label, option?: SearchOption) => addOption(option)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PositionDescriptionDetailsEditor({
  value,
  disabled,
  onChange,
  positionNames,
  departmentNames,
  template,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  positionNames: Set<string>;
  departmentNames: Set<string>;
  template: PositionDescriptionTemplate;
}) {
  const confirmDelete = useConfirmDelete();
  const details = parseDetailsObject(value);
  if (!details) {
    return (
      <label className="space-y-1 md:col-span-2">
        <span className="text-xs font-medium text-red-500">明细 JSON 格式错误</span>
        <textarea
          value={value}
          disabled={disabled}
          rows={14}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y rounded-md border border-red-300 px-3 py-2 font-mono text-xs leading-5 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-slate-100"
        />
      </label>
    );
  }

  const parsedDetails = normalizePositionDetails(details);
  const visibleGroups = new Set(template.groups);
  const visibleFields = template.fields ? new Set(template.fields) : null;
  const baseDetailKeys = POSITION_DESCRIPTION_BASE_DETAIL_KEYS;
  const qualificationDetailKeys = POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS;
  const flowDetailKeys = POSITION_DESCRIPTION_FLOW_DETAIL_KEYS;
  const groupedDetailKeys = new Set([...baseDetailKeys, ...qualificationDetailKeys, ...flowDetailKeys, ...HIDDEN_POSITION_DETAIL_KEYS, "duties", "managementDuties", "changeHistory", "attachments"]);
  const standardKeys = [
    ...DETAIL_FIELD_ORDER,
    ...Object.keys(parsedDetails).filter((key) => !DETAIL_FIELD_ORDER.includes(key)).sort((a, b) => a.localeCompare(b, "zh-CN")),
  ];

  function updateDetailValue(key: string, nextValue: unknown) {
    const next = { ...parsedDetails, [key]: nextValue };
    onChange(JSON.stringify(next, null, 2));
  }

  function updateDetailField(key: string, raw: string) {
    updateDetailValue(key, textToDetailValue(parsedDetails[key], raw));
  }

  function renderPrimitiveField(key: string) {
    if (HIDDEN_POSITION_DETAIL_KEYS.has(key)) return null;
    const fieldValue = parsedDetails[key];
    if (key === "subordinates") {
      return (
        <div key={key} className="md:col-span-2">
          <SubordinateTagsEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            positionNames={positionNames}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "rank") {
      return (
        <label key={key} className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{DETAIL_FIELD_LABELS[key] || key}</span>
          <RankPicker
            value={fieldValue}
            options={HR_RANKS}
            disabled={disabled}
            onChange={(next) => updateDetailValue(key, next || null)}
          />
        </label>
      );
    }
    if (key === "education") {
      return (
        <label key={key} className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{DETAIL_FIELD_LABELS[key] || key}</span>
          <OptionPicker
            value={String(fieldValue || "无要求")}
            options={pickerOptions(EDUCATION_REQUIREMENT_OPTIONS)}
            disabled={disabled}
            placeholder="无要求"
            onChange={(next) => updateDetailValue(key, next || "无要求")}
          />
        </label>
      );
    }
    if (key === "major") {
      return (
        <div key={key} className="md:col-span-2">
          <MajorRequirementsEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "workEnvironments") {
      return (
        <div key={key} className="md:col-span-2">
          <WorkEnvironmentEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "experienceRequirements") {
      return (
        <div key={key} className="md:col-span-2">
          <ExperienceRequirementsEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "salaryType" || key === "officeLocation" || key === "workSchedule") {
      const options = key === "salaryType"
        ? SALARY_TYPE_OPTIONS
        : key === "officeLocation"
          ? HR_OFFICE_LOCATIONS
          : WORK_SCHEDULE_OPTIONS;
      return (
        <label key={key} className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{DETAIL_FIELD_LABELS[key] || key}</span>
          <OptionPicker
            value={fieldValue}
            options={pickerOptions(options)}
            disabled={disabled}
            placeholder="未设置"
            onChange={(next) => updateDetailValue(key, next || null)}
          />
        </label>
      );
    }
    if (key === "distributionDeptNames") {
      return (
        <div key={key} className="md:col-span-2">
          <EntityTagListEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            entity="department"
            disabled={disabled}
            validNames={departmentNames}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "trainingPositionNames") {
      return (
        <div key={key} className="md:col-span-2">
          <EntityTagListEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            entity="position"
            disabled={disabled}
            validNames={positionNames}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "drafter" || key === "reviewer1") {
      return (
        <EntityValueInput
          key={key}
          label={DETAIL_FIELD_LABELS[key] || key}
          entity="department"
          value={fieldValue}
          disabled={disabled}
          invalid={String(fieldValue || "").includes("见首页")}
          onChange={(next) => updateDetailValue(key, next)}
        />
      );
    }
    if (key === "reviewer2" || key === "approver") {
      return (
        <EntityValueInput
          key={key}
          label={DETAIL_FIELD_LABELS[key] || key}
          entity="employee"
          value={fieldValue}
          disabled={disabled}
          invalid={String(fieldValue || "").includes("见首页")}
          onChange={(next) => updateDetailValue(key, next)}
        />
      );
    }
    if (isPrimitiveArray(fieldValue) || key === "training") {
      return (
        <div key={key} className="md:col-span-2">
          <StringListEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    const rows = detailFieldRows(fieldValue);
    const className = formInputClassName;
    return (
      <label key={key} className={`space-y-1 ${rows > 1 ? "md:col-span-2" : ""}`}>
        <span className="text-xs font-medium text-slate-500">{DETAIL_FIELD_LABELS[key] || key}</span>
        {rows === 1 ? (
          <input
            value={detailValueToText(fieldValue)}
            disabled={disabled}
            onChange={(event) => updateDetailField(key, event.target.value)}
            className={className}
          />
        ) : (
          <textarea
            value={detailValueToText(fieldValue)}
            disabled={disabled}
            rows={rows}
            spellCheck={false}
            onChange={(event) => updateDetailField(key, event.target.value)}
            className={`${className} resize-y ${fieldValue && typeof fieldValue === "object" && !isPrimitiveArray(fieldValue) ? "font-mono text-xs leading-5" : ""}`}
          />
        )}
      </label>
    );
  }

  function renderDutyEditor(key: string, label: string) {
    const records = Array.isArray(parsedDetails[key]) ? parsedDetails[key] as Array<Record<string, unknown>> : [];
    function updateDuty(index: number, patch: Record<string, unknown>) {
      updateDetailValue(key, records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
    }
    function addDuty() {
      updateDetailValue(key, [...records, { title: "", items: [] }]);
    }
    async function removeDuty(index: number) {
      const confirmed = await confirmDelete({
        message: `确定删除「${label} ${index + 1}」吗？删除后需要保存才会生效。`,
      });
      if (!confirmed) return;
      updateDetailValue(key, records.filter((_, recordIndex) => recordIndex !== index));
    }
    return (
      <div key={key} className="space-y-3 md:col-span-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">{label}</span>
          {!disabled && (
            <button
              type="button"
              onClick={addDuty}
              className={smallSecondaryActionClassName}
            >
              新增
            </button>
          )}
        </div>
        {records.map((record, index) => {
          const items = Array.isArray(record.items) ? record.items : [];
          return (
            <div key={index} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">职责 {index + 1}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`删除${label} ${index + 1}`}
                    onClick={() => void removeDuty(index)}
                    className="grid size-7 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={String(record.title || "")}
                  disabled={disabled}
                  placeholder="职责标题"
                  onChange={(event) => updateDuty(index, { title: event.target.value })}
                  className={formInputClassName}
                />
                <StringListEditor
                  label="职责条目"
                  value={items}
                  disabled={disabled}
                  placeholder="新增职责条目"
                  onChange={(nextItems) => updateDuty(index, { items: nextItems })}
                />
              </div>
            </div>
          );
        })}
        {records.length === 0 && <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">未设置</p>}
      </div>
    );
  }

  function renderChangeHistory() {
    const key = "changeHistory";
    const records = Array.isArray(parsedDetails[key]) ? parsedDetails[key] as Array<Record<string, unknown>> : [];
    function updateRecord(index: number, patch: Record<string, unknown>) {
      updateDetailValue(key, records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
    }
    function addRecord() {
      const nextVersion = formatHistoryVersion(Math.max(-1, ...records.map((record) => versionNumber(record.version))) + 1);
      updateDetailValue(key, [...records, { version: nextVersion, documentName: "", effectiveDate: "", approver: "" }]);
    }
    async function removeRecord(index: number) {
      const confirmed = await confirmDelete({
        message: `确定删除变更历史 ${index + 1} 吗？删除后需要保存才会生效。`,
      });
      if (!confirmed) return;
      updateDetailValue(key, records.filter((_, recordIndex) => recordIndex !== index));
    }
    return (
      <div key={key} className="space-y-3 md:col-span-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">变更历史</span>
          {!disabled && (
            <button
              type="button"
              onClick={addRecord}
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              新增
            </button>
          )}
        </div>
        {records.map((record, index) => {
          const rawDate = String(record.effectiveDate || "");
          const normalizedDate = normalizeDateValue(rawDate);
          const dateInvalid = !!rawDate && !normalizedDate;
          const approverInvalid = String(record.approver || "").includes("见首页");
          return (
          <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[88px_minmax(0,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)]">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">版本</span>
              <input
                value={String(record.version || formatHistoryVersion(index))}
                disabled
                className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">文件名</span>
              <input
                value={String(record.documentName || "")}
                disabled={disabled}
                onChange={(event) => updateRecord(index, { documentName: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
              />
            </label>
            <label className="space-y-1">
              <span className={`text-xs font-medium ${dateInvalid ? "text-red-500" : "text-slate-500"}`}>生效日期</span>
              <CalendarDateInput
                value={rawDate}
                disabled={disabled}
                onChange={(next) => updateRecord(index, { effectiveDate: next || "" })}
                className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-slate-100 ${
                  dateInvalid
                    ? "border-red-300 text-red-700 focus:border-red-500 focus:ring-red-500"
                    : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500"
                }`}
              />
              {dateInvalid && <p className="text-xs text-red-500">日期格式错误，请重新选择。</p>}
            </label>
            <EntityValueInput
              label="批准"
              entity="employee"
              value={record.approver}
              disabled={disabled}
              invalid={approverInvalid}
              onChange={(next) => updateRecord(index, { approver: next || "" })}
            />
            {!disabled && (
              <button
                type="button"
                aria-label={`删除变更历史 ${index + 1}`}
                onClick={() => void removeRecord(index)}
                className="self-end grid size-8 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500 md:col-span-4 md:justify-self-end"
              >
                ×
              </button>
            )}
          </div>
        );
        })}
        {records.length === 0 && <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">未设置</p>}
      </div>
    );
  }

  function renderGroup(title: string, keys: string[]) {
    const visibleKeys = visibleFields ? keys.filter((key) => visibleFields.has(key)) : keys;
    if (visibleKeys.length === 0) return null;
    return (
      <div className="space-y-3 md:col-span-2">
        <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">{title}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleKeys.map((key) => renderPrimitiveField(key))}
        </div>
      </div>
    );
  }

  const restKeys = standardKeys.filter((key) => !groupedDetailKeys.has(key) && !HIDDEN_POSITION_DETAIL_KEYS.has(key));
  const showGroup = (group: PositionDescriptionTemplateGroup) => visibleFields ? false : visibleGroups.has(group);
  const showField = (key: string, group: PositionDescriptionTemplateGroup) => visibleFields ? visibleFields.has(key) : visibleGroups.has(group);

  return (
    <>
      {(showGroup("base") || baseDetailKeys.some((key) => showField(key, "base"))) && renderGroup("说明书基础", baseDetailKeys)}
      {(showGroup("qualification") || qualificationDetailKeys.some((key) => showField(key, "qualification"))) && renderGroup("任职资格", qualificationDetailKeys)}
      {showField("duties", "duties") && renderDutyEditor("duties", "主要职责")}
      {showField("managementDuties", "managementDuties") && renderDutyEditor("managementDuties", "管理职责")}
      {(showGroup("flow") || flowDetailKeys.some((key) => showField(key, "flow"))) && renderGroup("流转与审批", flowDetailKeys)}
      {showField("changeHistory", "history") && renderChangeHistory()}
      {!visibleFields && visibleGroups.has("rest") && restKeys.length > 0 && (
        <div className="space-y-3 md:col-span-2">
          <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">其他字段</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {restKeys.map((key) => renderPrimitiveField(key))}
          </div>
        </div>
      )}
    </>
  );
}

function DepartmentDescriptionDetailsEditor({
  value,
  disabled,
  managerPositionName,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  managerPositionName: string;
  onChange: (value: string) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const details = parseDetailsObject(value);
  if (!details) {
    return (
      <label className="space-y-1 md:col-span-2">
        <span className="text-xs font-medium text-red-500">部门说明书 JSON 格式错误</span>
        <textarea
          value={value}
          disabled={disabled}
          rows={12}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y rounded-md border border-red-300 px-3 py-2 font-mono text-xs leading-5 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-slate-100"
        />
      </label>
    );
  }

  const parsedDetails = details;

  function updateDetailValue(key: string, nextValue: unknown) {
    onChange(JSON.stringify({ ...parsedDetails, [key]: nextValue }, null, 2));
  }

  function updateBasicInfoField(field: string, raw: string | string[]) {
    const basic = parsedDetails["基本信息"] && typeof parsedDetails["基本信息"] === "object" && !Array.isArray(parsedDetails["基本信息"])
      ? parsedDetails["基本信息"] as Record<string, unknown>
      : {};
    updateDetailValue("基本信息", { ...basic, [field]: raw });
  }

  function renderBasicInfo() {
    const basic = parsedDetails["基本信息"] && typeof parsedDetails["基本信息"] === "object" && !Array.isArray(parsedDetails["基本信息"])
      ? parsedDetails["基本信息"] as Record<string, unknown>
      : {};
    const fields = ["负责人"];
    return (
      <div className="space-y-3 md:col-span-2">
        <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">基本信息</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {fields.map((field) => {
            const fieldValue = basic[field];
            if (field === "负责人") {
              return (
                <label key={field} className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">{field}</span>
                  <input
                    value={managerPositionName}
                    disabled
                    className="w-full cursor-not-allowed rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700"
                  />
                </label>
              );
            }
            if (isPrimitiveArray(fieldValue)) {
              return (
                <div key={field} className="md:col-span-2">
                  <StringListEditor
                    label={field}
                    value={fieldValue}
                    disabled={disabled}
                    onChange={(items) => updateBasicInfoField(field, items)}
                  />
                </div>
              );
            }
            return (
              <label key={field} className="space-y-1">
                <span className="text-xs font-medium text-slate-500">{field}</span>
                <input
                  value={String(fieldValue || "")}
                  disabled={disabled}
                  onChange={(event) => updateBasicInfoField(field, event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                />
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function renderDutyDescription() {
    const key = "部门职责描述";
    const records = Array.isArray(parsedDetails[key]) ? parsedDetails[key] as Array<Record<string, unknown>> : [];
    function updateRecord(index: number, patch: Record<string, unknown>) {
      updateDetailValue(key, records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
    }
    function addRecord() {
      updateDetailValue(key, [...records, { title: "", items: [] }]);
    }
    async function removeRecord(index: number) {
      const confirmed = await confirmDelete({
        message: `确定删除部门职责 ${index + 1} 吗？删除后需要保存才会生效。`,
      });
      if (!confirmed) return;
      updateDetailValue(key, records.filter((_, recordIndex) => recordIndex !== index));
    }
    return (
      <div className="space-y-3 md:col-span-2">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
          <span className="text-sm font-semibold text-slate-900">部门职责描述</span>
          {!disabled && (
            <button
              type="button"
              onClick={addRecord}
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              新增
            </button>
          )}
        </div>
        {records.map((record, index) => {
          const items = Array.isArray(record.items) ? record.items : [];
          return (
            <div key={index} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">职责 {index + 1}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`删除部门职责 ${index + 1}`}
                    onClick={() => void removeRecord(index)}
                    className="grid size-7 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={String(record.title || "")}
                  disabled={disabled}
                  placeholder="职责标题"
                  onChange={(event) => updateRecord(index, { title: event.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                />
                <StringListEditor
                  label="职责条目"
                  value={items}
                  disabled={disabled}
                  placeholder="新增职责条目"
                  onChange={(nextItems) => updateRecord(index, { items: nextItems })}
                />
              </div>
            </div>
          );
        })}
        {records.length === 0 && <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">未设置</p>}
      </div>
    );
  }

  const remainingKeys = Object.keys(parsedDetails).filter((key) => !["基本信息", "部门职责概要", "部门职责描述"].includes(key));

  return (
    <>
      {renderBasicInfo()}
      <div className="md:col-span-2">
        <StringListEditor
          label="部门职责概要"
          value={parsedDetails["部门职责概要"]}
          disabled={disabled}
          placeholder="新增概要"
          onChange={(items) => updateDetailValue("部门职责概要", items)}
        />
      </div>
      {renderDutyDescription()}
      {remainingKeys.length > 0 && (
        <div className="space-y-3 md:col-span-2">
          <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">其他字段</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {remainingKeys.map((key) => {
              if (isPrimitiveArray(parsedDetails[key])) {
                return (
                  <div key={key} className="md:col-span-2">
                    <StringListEditor
                      label={key}
                      value={parsedDetails[key]}
                      disabled={disabled}
                      onChange={(items) => updateDetailValue(key, items)}
                    />
                  </div>
                );
              }
              return (
                <label key={key} className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-500">{key}</span>
                  <textarea
                    value={detailValueToText(parsedDetails[key])}
                    disabled={disabled}
                    rows={detailFieldRows(parsedDetails[key])}
                    spellCheck={false}
                    onChange={(event) => updateDetailValue(key, textToDetailValue(parsedDetails[key], event.target.value))}
                    className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-xs leading-5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function normalizeDescriptionForCompare(draft: DescriptionDraft | null) {
  return draft ? JSON.stringify(descriptionPayload(draft)) : "";
}

function normalizePositionDescriptionForCompare(position: Position) {
  const draft = createDescriptionDraft(position);
  return normalizeDescriptionForCompare(draft);
}

function normalizeDepartmentDescriptionsForCompare(drafts: DepartmentDescriptionDraft[] | null) {
  return JSON.stringify((drafts || []).slice(0, 1).map(departmentDescriptionPayload));
}

function normalizeDepartmentDescriptionSourceForCompare(department: Department) {
  const source = department.descriptions[0]
    ? [createDepartmentDescriptionDraft(department, department.descriptions[0])]
    : [createDepartmentDescriptionDraft(department)];
  return normalizeDepartmentDescriptionsForCompare(source);
}

export default function DepartmentPositionTab({ user, mode = "position" }: { user: HRUser; mode?: DepartmentPositionMode }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<PositionDraft | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<DescriptionDraft | null>(null);
  const [departmentDraft, setDepartmentDraft] = useState<DepartmentDraft | null>(null);
  const [departmentDescriptionDrafts, setDepartmentDescriptionDrafts] = useState<DepartmentDescriptionDraft[]>([]);
  const [positionDescriptionTemplate, setPositionDescriptionTemplate] = useState<PositionDescriptionTemplateId>("common");
  const [storedPositionDescriptionTemplates, setStoredPositionDescriptionTemplates] = useState<PositionDescriptionTemplate[]>([]);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateEditingId, setTemplateEditingId] = useState<PositionDescriptionTemplateId | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [templateDraftFields, setTemplateDraftFields] = useState<string[]>([]);
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const [createPanel, setCreatePanel] = useState<"department" | "position" | null>(null);
  const [newDepartmentDraft, setNewDepartmentDraft] = useState<CreateDepartmentDraft>({ level: 1, parentId: null, code: "", name: "" });
  const [createPositionDraft, setCreatePositionDraft] = useState<CreatePositionDraft>({ departmentId: null, name: "" });
  const [collapsedDepartments, setCollapsedDepartments] = useState<Set<number>>(() => new Set());
  const [activeOrganizationRootId, setActiveOrganizationRootId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedTab, setArchivedTab] = useState<ArchivedEntityTab>("departments");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const confirmDelete = useConfirmDelete();

  const canEdit = hrCanEdit(user);
  const isOrganizationMode = mode === "organization";
  const canEditDepartment = canEdit && !isOrganizationMode && !showArchived;
  const canEditPosition = canEdit && !isOrganizationMode && !showArchived;
  const positionNames = useMemo(() => new Set(positions.map((position) => position.name).filter(Boolean)), [positions]);
  const departmentNames = useMemo(() => new Set(departments.map((department) => department.name).filter(Boolean)), [departments]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deptRes, posRes] = await Promise.all([
        fetch(workspacePath(`/api/hr/departments?pageSize=500${showArchived ? "&archived=1" : ""}`)),
        fetch(workspacePath(`/api/hr/positions?pageSize=500${showArchived ? "&archived=1" : ""}`)),
      ]);
      if (!deptRes.ok || !posRes.ok) throw new Error("加载失败");
      const [deptData, posData] = await Promise.all([deptRes.json(), posRes.json()]);
      const nextDepartments = deptData.departments || [];
      const nextPositions = posData.positions || [];
      setDepartments(nextDepartments);
      setPositions(nextPositions);
      if (!showArchived) {
        setSelection((prev) => {
          if (prev?.type === "department" && nextDepartments.some((department: Department) => department.id === prev.id)) return prev;
          if (prev?.type === "position" && nextPositions.some((position: Position) => position.id === prev.id)) return prev;
          return nextDepartments[0] ? { type: "department", id: nextDepartments[0].id } : null;
        });
      }
    } catch (_err) {
      setError("部门岗位加载失败");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isOrganizationMode || selection?.type !== "position") return;
    setSelection(departments[0] ? { type: "department", id: departments[0].id } : null);
  }, [departments, isOrganizationMode, selection]);

  useEffect(() => {
    setCreatePanel(null);
    if (mode === "organization") setShowArchived(false);
  }, [mode]);

  useEffect(() => {
    if (newDepartmentDraft.code) return;
    const suggestedCode = suggestDepartmentCodeInput(newDepartmentDraft, departments);
    if (!suggestedCode) return;
    setNewDepartmentDraft((prev) => prev.code ? prev : { ...prev, code: suggestedCode });
  }, [newDepartmentDraft, departments]);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      try {
        const res = await fetch(workspacePath("/api/hr/position-description-templates"));
        if (!res.ok) return;
        const data = await res.json();
        const templates = Array.isArray(data.templates)
          ? data.templates
            .map((template: unknown) => sanitizePositionDescriptionTemplate(template))
            .filter((template: PositionDescriptionTemplate | null): template is PositionDescriptionTemplate => Boolean(template))
          : [];
        if (!cancelled) setStoredPositionDescriptionTemplates(templates);
      } catch {
        // Template loading is optional; built-in templates are always available.
      }
    }
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const positionDescriptionTemplates = useMemo(
    () => mergePositionDescriptionTemplates(storedPositionDescriptionTemplates),
    [storedPositionDescriptionTemplates]
  );
  const selectedPositionDescriptionTemplate = useMemo(
    () => positionDescriptionTemplates.find((template) => template.id === positionDescriptionTemplate) || positionDescriptionTemplates[0] || COMMON_POSITION_DESCRIPTION_TEMPLATE,
    [positionDescriptionTemplate, positionDescriptionTemplates]
  );

  useEffect(() => {
    if (positionDescriptionTemplates.length === 0) return;
    if (positionDescriptionTemplates.some((template) => template.id === positionDescriptionTemplate)) return;
    setPositionDescriptionTemplate(positionDescriptionTemplates.find((template) => template.id === "common")?.id || positionDescriptionTemplates[0].id);
  }, [positionDescriptionTemplate, positionDescriptionTemplates]);

  const selectedPositionDescriptionTemplateStored = useMemo(
    () => selectedPositionDescriptionTemplate.id !== "full" && storedPositionDescriptionTemplates.some((template) => template.id === selectedPositionDescriptionTemplate.id),
    [selectedPositionDescriptionTemplate.id, storedPositionDescriptionTemplates]
  );
  const selectedPositionDescriptionTemplateDefault = isDefaultPositionDescriptionTemplate(selectedPositionDescriptionTemplate.id);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const positionById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const createDepartmentParentOptions = useMemo(
    () => departments
      .filter((department) => department.level === newDepartmentDraft.level - 1)
      .sort((a, b) => a.code.localeCompare(b.code, "zh-CN")),
    [newDepartmentDraft.level, departments]
  );
  const createDepartmentCode = useMemo(
    () => composeDepartmentCode(newDepartmentDraft, departments),
    [newDepartmentDraft, departments]
  );
  const createDepartmentCodeError = useMemo(
    () => departmentCodeError(newDepartmentDraft, departments),
    [newDepartmentDraft, departments]
  );
  const createDepartmentCodeInputDisabled = newDepartmentDraft.level > 1 && !newDepartmentDraft.parentId;
  const createDepartmentCodeFieldError = createDepartmentCodeInputDisabled ? "" : createDepartmentCodeError;
  const createDepartmentCodeAffixes = useMemo(
    () => departmentCodeAffixes(newDepartmentDraft, departments),
    [newDepartmentDraft, departments]
  );
  const createPositionDepartment = createPositionDraft.departmentId ? departmentById.get(createPositionDraft.departmentId) : undefined;
  const createPositionCode = useMemo(
    () => generatePositionCode(createPositionDepartment, positions),
    [createPositionDepartment, positions]
  );

  const positionsByDepartment = useMemo(() => {
    const map = new Map<number, Position[]>();
    for (const position of positions) {
      if (!position.departmentId) continue;
      const list = map.get(position.departmentId) || [];
      list.push(position);
      map.set(position.departmentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.code.localeCompare(b.code, "zh-CN"));
    }
    return map;
  }, [positions]);

  const departmentStats = useMemo(() => {
    const childrenByParent = new Map<number | null, Department[]>();
    for (const department of departments) {
      const list = childrenByParent.get(department.parentId) || [];
      list.push(department);
      childrenByParent.set(department.parentId, list);
    }

    const statsById = new Map<number, DepartmentPositionStats>();
    const visiting = new Set<number>();

    function calculate(departmentId: number): DepartmentPositionStats {
      const cached = statsById.get(departmentId);
      if (cached) return cached;
      if (visiting.has(departmentId)) {
        return { directPositions: 0, totalPositions: 0, directHeadcount: 0, totalHeadcount: 0 };
      }
      visiting.add(departmentId);

      const directPositions = positionsByDepartment.get(departmentId) || [];
      const stats: DepartmentPositionStats = {
        directPositions: directPositions.length,
        totalPositions: directPositions.length,
        directHeadcount: directPositions.reduce((sum, position) => sum + plannedHeadcount(position), 0),
        totalHeadcount: directPositions.reduce((sum, position) => sum + plannedHeadcount(position), 0),
      };

      for (const child of childrenByParent.get(departmentId) || []) {
        const childStats = calculate(child.id);
        stats.totalPositions += childStats.totalPositions;
        stats.totalHeadcount += childStats.totalHeadcount;
      }

      visiting.delete(departmentId);
      statsById.set(departmentId, stats);
      return stats;
    }

    for (const department of departments) calculate(department.id);
    return statsById;
  }, [departments, positionsByDepartment]);

  const selectedDepartment = selection?.type === "department" ? departmentById.get(selection.id) : undefined;
  const selectedPosition = selection?.type === "position" ? positionById.get(selection.id) : undefined;
  const selectedDepartmentStats = selectedDepartment
    ? departmentStats.get(selectedDepartment.id) ?? { directPositions: 0, totalPositions: 0, directHeadcount: 0, totalHeadcount: 0 }
    : null;
  const selectedDepartmentParentPath = selectedDepartment ? departmentParentPath(selectedDepartment, departmentById) : "";

  useEffect(() => {
    setDraft(selectedPosition ? createDraft(selectedPosition) : null);
    setDescriptionDraft(selectedPosition ? createDescriptionDraft(selectedPosition) : null);
  }, [selectedPosition]);

  useEffect(() => {
    setDepartmentDraft(selectedDepartment ? createDepartmentDraft(selectedDepartment) : null);
    setDepartmentDescriptionDrafts(selectedDepartment
      ? [createDepartmentDescriptionDraft(selectedDepartment, selectedDepartment.descriptions[0])]
      : []);
  }, [selectedDepartment]);

  const positionDirty = Boolean(draft && selectedPosition && normalizeDraftForCompare(draft) !== normalizePositionForCompare(selectedPosition));
  const descriptionDirty = Boolean(descriptionDraft && selectedPosition && normalizeDescriptionForCompare(descriptionDraft) !== normalizePositionDescriptionForCompare(selectedPosition));
  const departmentDirty = Boolean(departmentDraft && selectedDepartment && JSON.stringify(departmentDraftPayload(departmentDraft)) !== JSON.stringify(departmentDraftPayload(createDepartmentDraft(selectedDepartment))));
  const departmentDescriptionDirty = Boolean(selectedDepartment && normalizeDepartmentDescriptionsForCompare(departmentDescriptionDrafts) !== normalizeDepartmentDescriptionSourceForCompare(selectedDepartment));
  const dirty = positionDirty || descriptionDirty;

  const rootDepartments = useMemo(() => departments.filter((department) => !department.parentId).sort((a, b) => a.id - b.id), [departments]);

  const visibleDepartmentIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim();
    const ids = new Set<number>();
    function addAncestors(departmentId: number | null) {
      let current = departmentId ? departmentById.get(departmentId) : undefined;
      const guard = new Set<number>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        ids.add(current.id);
        current = current.parentId ? departmentById.get(current.parentId) : undefined;
      }
    }
    for (const department of departments) {
      const haystack = [department.code, department.name, department.alias, departmentPath(department, departmentById)]
        .filter(Boolean)
        .map(String);
      if (haystack.some((item) => matchText(item, q))) addAncestors(department.id);
    }
    if (!isOrganizationMode) {
      for (const position of positions) {
        const haystack = [
          position.code,
          position.codeRaw,
          position.name,
          position.alias,
          position.positionDescriptionName,
          position.positionDescriptionCode,
          departmentPath(position.departmentId ? departmentById.get(position.departmentId) : undefined, departmentById),
        ].filter(Boolean).map(String);
        if (haystack.some((item) => matchText(item, q))) addAncestors(position.departmentId);
      }
    }
    return ids;
  }, [departmentById, departments, isOrganizationMode, positions, search]);

  const visibleRootDepartments = useMemo(
    () => rootDepartments.filter((department) => !visibleDepartmentIds || visibleDepartmentIds.has(department.id)),
    [rootDepartments, visibleDepartmentIds]
  );
  const activeOrganizationRoot = useMemo(
    () => (activeOrganizationRootId ? visibleRootDepartments.find((department) => department.id === activeOrganizationRootId) || null : null),
    [activeOrganizationRootId, visibleRootDepartments]
  );
  const archivedDepartments = useMemo(() => {
    const keyword = search.trim();
    return departments
      .filter((department) => {
        if (!keyword) return true;
        return [department.code, department.name, department.alias, department.parentName]
          .filter(Boolean)
          .map(String)
          .some((item) => matchText(item, keyword));
      })
      .sort((a, b) => archiveTimestamp(b.archivedAt) - archiveTimestamp(a.archivedAt) || b.id - a.id);
  }, [departments, search]);
  const archivedPositions = useMemo(() => {
    const keyword = search.trim();
    return positions
      .filter((position) => {
        if (!keyword) return true;
        return [
          position.code,
          position.codeRaw,
          position.name,
          position.alias,
          position.departmentName,
          position.positionDescriptionName,
          position.positionDescriptionCode,
        ]
          .filter(Boolean)
          .map(String)
          .some((item) => matchText(item, keyword));
      })
      .sort((a, b) => archiveTimestamp(b.archivedAt) - archiveTimestamp(a.archivedAt) || b.id - a.id);
  }, [positions, search]);

  useEffect(() => {
    if (!showArchived) return;
    setSelection((prev) => {
      if (archivedTab === "departments") {
        if (prev?.type === "department" && archivedDepartments.some((department) => department.id === prev.id)) return prev;
        return archivedDepartments[0] ? { type: "department", id: archivedDepartments[0].id } : null;
      }
      if (prev?.type === "position" && archivedPositions.some((position) => position.id === prev.id)) return prev;
      return archivedPositions[0] ? { type: "position", id: archivedPositions[0].id } : null;
    });
  }, [archivedDepartments, archivedPositions, archivedTab, showArchived]);

  function selectItem(nextSelection: Selection) {
    setSelection(nextSelection);
    setTreeDrawerOpen(false);
  }

  function toggleDepartmentCollapsed(departmentId: number) {
    setCollapsedDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  }

  function setAllDepartmentsCollapsed(collapsed: boolean) {
    setCollapsedDepartments(collapsed ? new Set(departments.map((department) => department.id)) : new Set());
  }

  function renderDepartmentNode(department: Department, level = 0): ReactNode {
    if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
    const children = departments.filter((item) => item.parentId === department.id).sort((a, b) => a.id - b.id);
    const isSelected = selection?.type === "department" && selection.id === department.id;
    const hasChildren = children.length > 0;
    const isCollapsed = !search.trim() && collapsedDepartments.has(department.id);
    const stats = departmentStats.get(department.id) ?? { directPositions: 0, totalPositions: 0, directHeadcount: 0, totalHeadcount: 0 };

    return (
      <div key={department.id} className={level > 0 ? "ml-3 border-l border-slate-200 pl-2" : ""}>
        <TreeNodeCard
          title={department.name}
          code={department.code}
          level={department.level}
          active={isSelected}
          onClick={() => selectItem({ type: "department", id: department.id })}
          toggle={{
            enabled: hasChildren,
            expanded: !isCollapsed,
            label: isCollapsed ? "展开部门" : "收起部门",
            onClick: () => toggleDepartmentCollapsed(department.id),
          }}
          meta={
            <span className="flex flex-wrap gap-2">
              <span
                className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                title="岗位数：直属岗位 / 含下级部门总岗位"
              >
                岗 直属 {stats.directPositions} · 总 {stats.totalPositions}
              </span>
              <span
                className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                title="编制：直属岗位编制 / 含下级部门总编制"
              >
                编 直属 {stats.directHeadcount} · 总 {stats.totalHeadcount}
              </span>
            </span>
          }
          className="my-2"
        />

        {!isCollapsed && children.map((child) => renderDepartmentNode(child, level + 1))}
      </div>
    );
  }

  function renderOrganizationBranch(department: Department, level = 0): ReactNode {
    if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
    const children = departments.filter((item) => item.parentId === department.id).sort((a, b) => a.id - b.id);
    const isCollapsed = !search.trim() && collapsedDepartments.has(department.id);
    const hasChildren = children.length > 0;
    const managerName = departmentManagerPositionName(department);
    const childNodes = !isCollapsed ? children.map((child) => renderOrganizationBranch(child, level + 1)).filter(Boolean) : [];

    return (
      <TreeNodeBranch key={department.id}>
        <TreeNodeCard
          title={department.name}
          code={department.code}
          level={department.level}
          tone={level === 1 ? "blue" : "amber"}
          meta={managerName ? `负责人：${managerName} · 下级 ${children.length}` : `下级 ${children.length}`}
          titleClassName="text-sm"
          toggle={{
            enabled: hasChildren,
            expanded: !isCollapsed,
            label: isCollapsed ? "展开部门" : "收起部门",
            onClick: () => toggleDepartmentCollapsed(department.id),
          }}
          onClick={() => hasChildren && toggleDepartmentCollapsed(department.id)}
        >
          {childNodes.length > 0 ? childNodes : null}
        </TreeNodeCard>
      </TreeNodeBranch>
    );
  }

  function renderOrganizationRoot(department: Department): ReactNode {
    if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
    const children = departments.filter((item) => item.parentId === department.id).sort((a, b) => a.id - b.id);
    const managerName = departmentManagerPositionName(department);
    const active = activeOrganizationRoot?.id === department.id;

    return (
      <TreeNodeCard
        key={department.id}
        title={department.name}
        code={department.code}
        level={1}
        showToggle={false}
        active={active}
        meta={
          <span className="flex min-w-0 items-center gap-2">
            {managerName && <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={`负责人：${managerName}`}>负责人：{managerName}</span>}
            <span className="shrink-0 whitespace-nowrap">下级 {children.length}</span>
          </span>
        }
        onClick={() => {
          setActiveOrganizationRootId(department.id);
          setCollapsedDepartments((prev) => {
            const next = new Set(prev);
            next.delete(department.id);
            return next;
          });
        }}
      />
    );
  }

  async function savePosition() {
    if (!dirty) return;
    if (draft && (!draft.code.trim() || !draft.name.trim())) {
      setToast({ type: "error", message: "岗位编码和名称不能为空" });
      return;
    }
    if (draft?.departmentId) {
      const department = departmentById.get(draft.departmentId);
      const suffix = positionCodeSuffix(draft.code);
      if (!department || !/^\d{2}$/.test(suffix) || draft.code !== composePositionCode(department, suffix, draft.code)) {
        setToast({ type: "error", message: "岗位编码必须由直属部门编码和两位序号组成" });
        return;
      }
    }
    if (draft && positions.some((position) => position.id !== draft.id && position.code === draft.code.trim())) {
      setToast({ type: "error", message: `岗位编码 ${draft.code.trim()} 已存在` });
      return;
    }
    if (descriptionDraft && (!descriptionDraft.code.trim() || !descriptionDraft.name.trim())) {
      setToast({ type: "error", message: "说明书编码和名称不能为空" });
      return;
    }
    if (descriptionDraft && !isPositiveIntegerText(descriptionDraft.headcount)) {
      setToast({ type: "error", message: "编制必须是正整数" });
      return;
    }
    if (descriptionDraft?.details.trim()) {
      try {
        JSON.parse(descriptionDraft.details);
      } catch {
        setToast({ type: "error", message: "说明书明细 JSON 不是合法格式" });
        return;
      }
    }
    setSaving(true);
    try {
      if (draft && positionDirty) {
        const res = await fetch(workspacePath("/api/hr/positions"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftPayload(draft)),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "保存岗位失败");
        }
      }
      if (descriptionDraft && descriptionDirty && selectedPosition) {
        const payload = {
          ...descriptionPayload(descriptionDraft),
          name: selectedPosition.name,
          departmentName: selectedPosition.departmentName || null,
        };
        const res = await fetch(workspacePath("/api/position-descriptions"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "保存岗位说明书失败");
        }
      }
      setToast({ type: "success", message: "岗位资料已保存" });
      await loadData();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  function updateDraft<K extends keyof PositionDraft>(key: K, value: PositionDraft[K]) {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function updateDraftDepartment(departmentId: number | null) {
    setDraft((prev) => {
      if (!prev) return prev;
      const department = departmentId ? departmentById.get(departmentId) : undefined;
      return {
        ...prev,
        departmentId,
        code: composePositionCode(department, positionCodeSuffix(prev.code), prev.code),
      };
    });
  }

  function updateDraftCodeSuffix(value: string, pad = false) {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    const suffix = pad && digits.length === 1 ? digits.padStart(2, "0") : digits;
    setDraft((prev) => {
      if (!prev) return prev;
      const department = prev.departmentId ? departmentById.get(prev.departmentId) : undefined;
      return { ...prev, code: composePositionCode(department, suffix, prev.code) };
    });
  }

  function updateDescriptionDraft<K extends keyof DescriptionDraft>(key: K, value: DescriptionDraft[K]) {
    setDescriptionDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function openPositionDescriptionTemplateEditor() {
    if (selectedPositionDescriptionTemplate.id === "full") return;
    const fields = positionDescriptionTemplateFields(selectedPositionDescriptionTemplate);
    setTemplateEditingId(selectedPositionDescriptionTemplate.id);
    setTemplateDraftName(selectedPositionDescriptionTemplate.label);
    setTemplateDraftFields(fields);
    setTemplateEditorOpen(true);
  }

  function openNewPositionDescriptionTemplateEditor() {
    setTemplateEditingId(null);
    setTemplateDraftName("");
    setTemplateDraftFields(positionDescriptionTemplateFields(selectedPositionDescriptionTemplate));
    setTemplateEditorOpen(true);
  }

  function handlePositionDescriptionTemplateChange(value: string) {
    if (value === NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION) {
      openNewPositionDescriptionTemplateEditor();
      return;
    }
    setPositionDescriptionTemplate(value as PositionDescriptionTemplateId);
    setTemplateEditorOpen(false);
  }

  function togglePositionDescriptionTemplateField(field: string) {
    setTemplateDraftFields((prev) => (
      prev.includes(field)
        ? prev.filter((item) => item !== field)
        : [...prev, field]
    ));
  }

  async function savePositionDescriptionTemplate() {
    if (templateEditingId === "full") {
      setToast({ type: "error", message: "完整模板是系统内置模板，不能编辑" });
      return;
    }
    const label = templateDraftName.trim();
    if (!label) {
      setToast({ type: "error", message: "模板名称不能为空" });
      return;
    }
    if (templateDraftFields.length === 0) {
      setToast({ type: "error", message: "至少选择一个字段" });
      return;
    }
    const id = templateEditingId || `custom-${Date.now()}`;
    const nextTemplate: PositionDescriptionTemplate = {
      id,
      label,
      groups: [],
      fields: templateDraftFields,
      custom: true,
    };
    const hasExistingTemplate = storedPositionDescriptionTemplates.some((template) => template.id === id);
    const nextTemplates = hasExistingTemplate
      ? storedPositionDescriptionTemplates.map((template) => template.id === id ? nextTemplate : template)
      : [...storedPositionDescriptionTemplates, nextTemplate];
    try {
      const res = await fetch(workspacePath("/api/hr/position-description-templates"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: nextTemplates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存模板失败");
      }
      const data = await res.json();
      const savedTemplates: PositionDescriptionTemplate[] = Array.isArray(data.templates)
        ? data.templates
          .map((template: unknown) => sanitizePositionDescriptionTemplate(template))
          .filter((template: PositionDescriptionTemplate | null): template is PositionDescriptionTemplate => Boolean(template))
        : nextTemplates;
      setStoredPositionDescriptionTemplates(savedTemplates);
      setPositionDescriptionTemplate(id);
      setTemplateEditorOpen(false);
      setToast({ type: "success", message: "模板已保存" });
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存模板失败" });
    }
  }

  async function deletePositionDescriptionTemplate() {
    if (!selectedPositionDescriptionTemplateStored) {
      setToast({ type: "error", message: "当前模板是系统默认模板，无需恢复" });
      return;
    }
    const isDefaultTemplate = isDefaultPositionDescriptionTemplate(selectedPositionDescriptionTemplate.id);
    const actionLabel = isDefaultTemplate ? "恢复默认" : "删除";
    const actionName = isDefaultTemplate ? "恢复默认模板" : "删除模板";
    const confirmed = await confirmDelete({
      title: actionName,
      message: isDefaultTemplate
        ? `确定将「${selectedPositionDescriptionTemplate.label}」恢复为系统默认模板吗？`
        : `确定删除「${selectedPositionDescriptionTemplate.label}」吗？`,
      confirmLabel: actionLabel,
    });
    if (!confirmed) return;
    const nextTemplates = storedPositionDescriptionTemplates.filter((template) => template.id !== selectedPositionDescriptionTemplate.id);
    const nextSelected = mergePositionDescriptionTemplates(nextTemplates).find((template) => template.id === "common") || mergePositionDescriptionTemplates(nextTemplates)[0];
    try {
      const res = await fetch(workspacePath("/api/hr/position-description-templates"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: nextTemplates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `${actionName}失败`);
      }
      const data = await res.json();
      const savedTemplates: PositionDescriptionTemplate[] = Array.isArray(data.templates)
        ? data.templates
          .map((template: unknown) => sanitizePositionDescriptionTemplate(template))
          .filter((template: PositionDescriptionTemplate | null): template is PositionDescriptionTemplate => Boolean(template))
        : nextTemplates;
      setStoredPositionDescriptionTemplates(savedTemplates);
      setPositionDescriptionTemplate(nextSelected?.id || "common");
      setTemplateEditorOpen(false);
      setToast({ type: "success", message: isDefaultTemplate ? "模板已恢复默认" : "模板已删除" });
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : `${actionName}失败` });
    }
  }

  async function createDepartment() {
    const name = newDepartmentDraft.name.trim();
    if (!name) {
      setToast({ type: "error", message: "部门名不能为空" });
      return;
    }
    if (newDepartmentDraft.level > 1 && !newDepartmentDraft.parentId) {
      setToast({ type: "error", message: `L${newDepartmentDraft.level} 部门必须选择上级部门` });
      return;
    }
    if (createDepartmentCodeError) {
      setToast({ type: "error", message: createDepartmentCodeError });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/hr/departments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: createDepartmentCode,
          name,
          level: newDepartmentDraft.level,
          parentId: newDepartmentDraft.level === 1 ? null : newDepartmentDraft.parentId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "新建部门失败");
      }
      const data = await res.json();
      const recordId = typeof data.record?.id === "number" ? data.record.id : null;
      setNewDepartmentDraft({ level: newDepartmentDraft.level, parentId: newDepartmentDraft.parentId, code: "", name: "" });
      setCreatePanel(null);
      await loadData();
      if (recordId) setSelection({ type: "department", id: recordId });
      setToast({ type: "success", message: "部门已新建" });
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "新建部门失败" });
    } finally {
      setSaving(false);
    }
  }

  async function createPosition() {
    const name = createPositionDraft.name.trim();
    if (!createPositionDraft.departmentId) {
      setToast({ type: "error", message: "请选择所属部门" });
      return;
    }
    if (!name) {
      setToast({ type: "error", message: "岗位名不能为空" });
      return;
    }
    if (!createPositionCode) {
      setToast({ type: "error", message: "无法生成岗位编码，请检查所属部门" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/hr/positions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: createPositionCode,
          name,
          departmentId: createPositionDraft.departmentId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "新建岗位失败");
      }
      const data = await res.json();
      const recordId = typeof data.record?.id === "number" ? data.record.id : null;
      setCreatePositionDraft({ departmentId: createPositionDraft.departmentId, name: "" });
      setCreatePanel(null);
      await loadData();
      if (recordId) setSelection({ type: "position", id: recordId });
      setToast({ type: "success", message: "岗位已新建" });
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "新建岗位失败" });
    } finally {
      setSaving(false);
    }
  }

  function updateDepartmentDescriptionDraft<K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) {
    setDepartmentDescriptionDrafts((prev) => prev.map((draft, draftIndex) => draftIndex === index ? { ...draft, [key]: value } : draft));
  }

  function updateDepartmentDraft<K extends keyof DepartmentDraft>(key: K, value: DepartmentDraft[K]) {
    setDepartmentDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function saveDepartmentInfo() {
    if (!selectedDepartment || !departmentDraft || !departmentDirty) return;
    const departmentName = departmentDraft.name.trim();
    if (!departmentName) {
      setToast({ type: "error", message: "部门名称不能为空" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/hr/departments"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedDepartment.id,
          name: departmentName,
          alias: serializeAlias(departmentDraft.alias || ""),
          descriptions: departmentDescriptionDrafts.slice(0, 1).map((draft) => departmentDescriptionPayload({
            ...draft,
            name: departmentName,
            details: sanitizeDepartmentDescriptionDetails(draft.details, departmentName, departmentDraft.managerPositionName),
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存部门信息失败");
      }
      setToast({ type: "success", message: "部门信息已保存" });
      await loadData();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function saveDepartmentDescription() {
    if (!selectedDepartment || !departmentDescriptionDirty) return;
    if (departmentDescriptionDrafts.some((draft) => !draft.code.trim() || !draft.name.trim())) {
      setToast({ type: "error", message: "部门说明书编码和名称不能为空" });
      return;
    }
    for (const draft of departmentDescriptionDrafts) {
      if (draft.details.trim()) {
        try {
          JSON.parse(draft.details);
        } catch {
          setToast({ type: "error", message: "部门说明书 JSON 不是合法格式" });
          return;
        }
      }
    }
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/hr/departments"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedDepartment.id,
          descriptions: departmentDescriptionDrafts.slice(0, 1).map((draft) => departmentDescriptionPayload({
            ...draft,
            name: selectedDepartment.name,
            details: sanitizeDepartmentDescriptionDetails(draft.details, selectedDepartment.name, departmentDraft?.managerPositionName || departmentManagerPositionName(selectedDepartment)),
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存部门说明书失败");
      }
      setToast({ type: "success", message: "部门说明书已保存" });
      await loadData();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function setDepartmentArchived(departmentId: number, archived: boolean) {
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/hr/departments"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: departmentId, isArchived: archived }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "操作失败");
      }
      setToast({ type: "success", message: archived ? "部门已归档" : "部门已恢复" });
      await loadData();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "操作失败" });
    } finally {
      setSaving(false);
    }
  }

  async function setPositionArchived(positionId: number, archived: boolean) {
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/hr/positions"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: positionId, isArchived: archived }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "操作失败");
      }
      setToast({ type: "success", message: archived ? "岗位已归档" : "岗位已恢复" });
      await loadData();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "操作失败" });
    } finally {
      setSaving(false);
    }
  }

  function renderDirectPositionPanel(departmentId: number) {
    const directPositions = positionsByDepartment.get(departmentId) || [];

    return (
      <PanelCard bodyClassName="p-4">
        {sectionTitle(
          "直属岗位",
          <span className="text-xs font-medium text-slate-500">{directPositions.length} 个</span>
        )}
        {directPositions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {directPositions.map((position) => {
              const active = selection?.type === "position" && selection.id === position.id;
              return (
                <button
                  key={position.id}
                  type="button"
                  onClick={() => selectItem({ type: "position", id: position.id })}
                  className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm transition ${
                    active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-blue-700">{shortPositionCode(position.code)}</span>
                  <span className="truncate">{position.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyStateCard compact>暂无直属岗位</EmptyStateCard>
        )}
      </PanelCard>
    );
  }

  function renderPositionEditor() {
    if (!selectedPosition) return null;
    const position = selectedPosition;
    const draftDepartment = draft?.departmentId ? departmentById.get(draft.departmentId) : undefined;
    const draftCodePrefix = positionCodePrefix(draftDepartment) || (showArchived ? positionCodePrefixFromCode(position.code) : "");
    const draftCodeSuffix = draft ? positionCodeSuffix(draft.code) : "";
    const draftDepartmentDisplay = departmentPath(draftDepartment, departmentById) || position.departmentName || "";
    return (
      <div className="space-y-5">
        {position.departmentId ? renderDirectPositionPanel(position.departmentId) : null}
        <PanelCard bodyClassName="p-4">
          {sectionTitle("岗位编辑", dirty && <span className="text-xs text-amber-600">有未保存修改</span>)}
          {draft && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">岗位编码</span>
                <div className="flex min-h-10 overflow-hidden rounded-md border border-slate-300 bg-white text-sm shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                  <span className="flex min-w-0 flex-1 items-center truncate border-r border-slate-200 bg-slate-50 px-3 font-mono text-slate-500" title={draftCodePrefix || "请先选择直属部门"}>
                    {draftCodePrefix || "选择直属部门后生成"}
                  </span>
                  <input
                    value={draftCodeSuffix}
                    disabled={!canEditPosition || !draftCodePrefix}
                    inputMode="numeric"
                    maxLength={2}
                    aria-label="岗位编码序号"
                    onChange={(event) => updateDraftCodeSuffix(event.target.value)}
                    onBlur={(event) => updateDraftCodeSuffix(event.target.value, true)}
                    className="w-20 border-0 bg-white px-3 py-2 font-mono text-slate-900 outline-none placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400"
                    placeholder="01"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">岗位名称</span>
                <input
                  value={draft.name}
                  disabled={!canEditPosition}
                  onChange={(event) => updateDraft("name", event.target.value)}
                  className={formInputClassName}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-500">别名</span>
                <PositionAliasTagsInput
                  value={draft.alias || ""}
                  disabled={!canEditPosition}
                  onChange={(value) => updateDraft("alias", value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">直属部门</span>
                <EntitySearchInput
                  entity="department"
                  value={draft.departmentId == null ? "" : String(draft.departmentId)}
                  displayValue={draftDepartmentDisplay}
                  disabled={!canEditPosition}
                  placeholder="搜索部门"
                  onChange={(_label, option?: SearchOption) => updateDraftDepartment(option?.id ?? null)}
                />
              </label>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            {canEdit && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void setPositionArchived(position.id, !showArchived)}
                className={getToolbarActionClassName("secondary")}
              >
                {showArchived ? "恢复岗位" : "归档岗位"}
              </button>
            )}
            <button
              type="button"
              disabled={!canEditPosition || !dirty || saving}
              onClick={savePosition}
              className={getToolbarActionClassName("primary")}
            >
              {saving ? "保存中..." : "保存岗位资料"}
            </button>
          </div>
        </PanelCard>

        {descriptionDraft && (
          <PanelCard bodyClassName="p-4">
            {sectionTitle(
              "岗位说明书",
              <div className="flex items-center gap-3">
                {descriptionDirty && <span className="text-xs text-amber-600">说明书有未保存修改</span>}
                <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span>模板</span>
                  <SelectField
                    value={positionDescriptionTemplate}
                    onChange={handlePositionDescriptionTemplateChange}
                    options={[
                      ...positionDescriptionTemplates.map((template) => ({ value: template.id, label: template.label })),
                      { value: NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION, label: "新建模板..." },
                    ]}
                    className="w-32"
                    selectClassName="min-h-7 text-slate-700"
                  />
                </label>
                <button
                  type="button"
                  disabled={selectedPositionDescriptionTemplate.id === "full"}
                  onClick={openPositionDescriptionTemplateEditor}
                  className={smallSecondaryActionClassName}
                >
                  编辑模板
                </button>
                {selectedPositionDescriptionTemplateStored && (
                  <button
                    type="button"
                    onClick={() => void deletePositionDescriptionTemplate()}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                      selectedPositionDescriptionTemplateDefault
                        ? "border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                        : "border-red-200 text-red-600 hover:bg-red-50"
                    }`}
                  >
                    {selectedPositionDescriptionTemplateDefault ? "恢复默认" : "删除模板"}
                  </button>
                )}
              </div>
            )}
            {templateEditorOpen && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <label className="min-w-64 flex-1 space-y-1">
                    <span className="text-xs font-medium text-slate-500">模板名称</span>
                    <input
                      value={templateDraftName}
                      onChange={(event) => setTemplateDraftName(event.target.value)}
                      className={formInputClassName}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void savePositionDescriptionTemplate()}
                      className={getToolbarActionClassName("primary")}
                    >
                      保存模板
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateEditorOpen(false)}
                      className={getToolbarActionClassName("secondary")}
                    >
                      取消
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map((group) => (
                    <div key={group.label} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-xs font-semibold text-slate-600">{group.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {group.fields.map((field) => (
                          <label
                            key={field}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                              templateDraftFields.includes(field)
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={templateDraftFields.includes(field)}
                              onChange={() => togglePositionDescriptionTemplateField(field)}
                              className="size-3 accent-emerald-600"
                            />
                            {DETAIL_FIELD_LABELS[field] || field}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">说明书名称</span>
                <input
                  value={position.name}
                  disabled
                  className={compactReadOnlyInputClassName}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">说明书部门</span>
                <input
                  value={position.departmentName || ""}
                  disabled
                  className={compactReadOnlyInputClassName}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">汇报对象</span>
                <EntitySearchInput
                  entity="position"
                  value={descriptionDraft.reportTo}
                  displayValue={descriptionDraft.reportTo}
                  disabled={!canEditPosition}
                  placeholder="搜索岗位"
                  onChange={(_label, option?: SearchOption) => updateDescriptionDraft("reportTo", selectedEntityName("position", option))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">编制</span>
                <input
                  value={descriptionDraft.headcount}
                  disabled={!canEditPosition}
                  inputMode="numeric"
                  onChange={(event) => updateDescriptionDraft("headcount", event.target.value.replace(/\D/g, ""))}
                  className={formInputClassName}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">版本</span>
                <input
                  value={deriveDescriptionMeta(descriptionDraft.details, descriptionDraft.version, descriptionDraft.effectiveDate).version}
                  disabled
                  className={compactReadOnlyInputClassName}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">生效日期</span>
                <input
                  value={deriveDescriptionMeta(descriptionDraft.details, descriptionDraft.version, descriptionDraft.effectiveDate).effectiveDate}
                  disabled
                  className={compactReadOnlyInputClassName}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-500">岗位目的</span>
                <textarea
                  value={descriptionDraft.positionPurpose}
                  disabled={!canEditPosition}
                  rows={3}
                  onChange={(event) => updateDescriptionDraft("positionPurpose", event.target.value)}
                  className={getFieldInputClassName("resize-y")}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-500">摘要</span>
                <textarea
                  value={descriptionDraft.summary}
                  disabled={!canEditPosition}
                  rows={3}
                  onChange={(event) => updateDescriptionDraft("summary", event.target.value)}
                  className={getFieldInputClassName("resize-y")}
                />
              </label>
              <PositionDescriptionDetailsEditor
                value={descriptionDraft.details}
                disabled={!canEditPosition}
                positionNames={positionNames}
                departmentNames={departmentNames}
                template={selectedPositionDescriptionTemplate}
                onChange={(value) => updateDescriptionDraft("details", value)}
              />
            </div>
          </PanelCard>
        )}
      </div>
    );
  }

  function renderDetailPane() {
    return (
      <PanelCard className="min-h-[520px]" bodyClassName="p-4">
        {!selection && <p className="py-12 text-center text-sm text-slate-400">选择部门或岗位查看详情</p>}
        {selectedDepartment && (
          <div className="space-y-4">
            {!isOrganizationMode && (
              renderDirectPositionPanel(selectedDepartment.id)
            )}
            <PanelCard bodyClassName="p-4">
              {sectionTitle(
                "部门信息",
                <div className="flex items-center gap-2">
                  {canEditDepartment && departmentDirty && <span className="text-xs text-amber-600">有未保存修改</span>}
                  <HierarchyBadge level={selectedDepartment.level} />
                </div>
              )}
              {departmentDraft && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)]">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">部门编码</span>
                      <input
                        value={selectedDepartment.code}
                        disabled
                        className={readOnlyInputClassName}
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-500">完整路径 / 部门名称</span>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${showArchived ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {showArchived ? "已归档" : "现用"}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void setDepartmentArchived(selectedDepartment.id, !showArchived)}
                              className={smallSecondaryActionClassName}
                            >
                              {showArchived ? "恢复部门" : "归档部门"}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex h-10 w-full overflow-hidden rounded-md border border-slate-300 bg-white text-sm shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                        {selectedDepartmentParentPath && (
                          <span
                            title={selectedDepartmentParentPath}
                            className="flex max-w-[60%] items-center truncate border-r border-slate-200 bg-slate-50 px-3 text-slate-500"
                          >
                            {selectedDepartmentParentPath} /
                          </span>
                        )}
                        <input
                          value={departmentDraft.name}
                          disabled={!canEditDepartment}
                          onChange={(event) => updateDepartmentDraft("name", event.target.value)}
                          className="min-w-0 flex-1 border-0 bg-white px-3 text-sm text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-500">别名</span>
                    <PositionAliasTagsInput
                      value={departmentDraft.alias}
                      disabled={!canEditDepartment}
                      onChange={(value) => updateDepartmentDraft("alias", value)}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">部门负责人</span>
                      <EntitySearchInput
                        entity="position"
                        value={departmentDraft.managerPositionName}
                        displayValue={departmentDraft.managerPositionName}
                        disabled={!canEditDepartment}
                        placeholder="搜索部门负责人"
                        onChange={(_label, option?: SearchOption) => {
                          updateDepartmentDraft("managerPositionName", selectedEntityName("position", option));
                        }}
                      />
                    </label>
                  </div>
                  <DetailStatsRow
                    items={[
                      { label: "直属岗位", value: selectedDepartmentStats?.directPositions ?? 0 },
                      { label: "总岗位", value: selectedDepartmentStats?.totalPositions ?? 0 },
                      { label: "直属编制", value: selectedDepartmentStats?.directHeadcount ?? 0 },
                      { label: "总编制", value: selectedDepartmentStats?.totalHeadcount ?? 0 },
                    ]}
                  />
                  {canEditDepartment && (
                    <div className="flex justify-end gap-2">
                      {departmentDraft.managerPositionName && (
                        <button
                          type="button"
                          onClick={() => {
                            updateDepartmentDraft("managerPositionName", "");
                          }}
                          className={getToolbarActionClassName("secondary")}
                        >
                          清空负责人
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canEditDepartment || !departmentDirty || saving}
                        onClick={saveDepartmentInfo}
                        className={getToolbarActionClassName("primary")}
                      >
                        {saving ? "保存中..." : "保存部门信息"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </PanelCard>
            {!isOrganizationMode && (
              <PanelCard bodyClassName="p-4">
                {sectionTitle(
                  "部门说明书",
                  departmentDescriptionDirty && <span className="text-xs text-amber-600">有未保存修改</span>
                )}
                <div className="space-y-5">
                  {departmentDescriptionDrafts.map((departmentDescriptionDraft, index) => (
                    <div key={departmentDescriptionDraft.id || `new-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 text-sm font-semibold text-slate-900">{departmentDescriptionDraft.name || `部门说明书 ${index + 1}`}</div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <DepartmentDescriptionDetailsEditor
                          value={departmentDescriptionDraft.details}
                          disabled={!canEditDepartment}
                          managerPositionName={departmentDraft?.managerPositionName || ""}
                          onChange={(value) => updateDepartmentDescriptionDraft(index, "details", value)}
                        />
                      </div>
                    </div>
                  ))}
                  {departmentDescriptionDrafts.length === 0 && (
                    <EmptyStateCard compact>暂无部门说明书</EmptyStateCard>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={!canEditDepartment || !departmentDescriptionDirty || saving}
                    onClick={saveDepartmentDescription}
                    className={getToolbarActionClassName("primary")}
                  >
                    {saving ? "保存中..." : "保存部门说明书"}
                  </button>
                </div>
              </PanelCard>
            )}
          </div>
        )}
        {!isOrganizationMode && selectedPosition && renderPositionEditor()}
      </PanelCard>
    );
  }

  function renderTreePanel(mode: "desktop" | "drawer") {
    return (
      <PanelCard className={mode === "drawer" ? "h-full overflow-hidden" : ""}>
        <div className="border-b border-slate-200 p-3">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{isOrganizationMode ? "组织架构" : "部门岗位架构"}</h3>
                <p className="mt-1 text-xs text-slate-500">{isOrganizationMode ? "按层级展开部门树。" : "岗位显示在直属部门下。"}</p>
              </div>
              {mode === "drawer" && (
                <button
                  type="button"
                  onClick={() => setTreeDrawerOpen(false)}
                  className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
                >
                  关闭
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAllDepartmentsCollapsed(false)}
                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                全部展开
              </button>
              <button
                type="button"
                onClick={() => setAllDepartmentsCollapsed(true)}
                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                全部收起
              </button>
            </div>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜索部门、编码"
              size="page"
            />
          </div>
        </div>
        <div className={`${mode === "drawer" ? "h-[calc(100%-96px)]" : "max-h-[760px]"} overflow-auto p-3`}>
          {loading && <p className="py-8 text-center text-sm text-slate-400">加载中...</p>}
          {error && <p className="py-8 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && rootDepartments.map((department) => renderDepartmentNode(department))}
        </div>
      </PanelCard>
    );
  }

  function renderOrganizationRootPanel(mode: "desktop" | "drawer") {
    return (
      <PanelCard className={mode === "drawer" ? "h-full overflow-hidden" : ""}>
        <div className="border-b border-slate-200 p-3">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">一级部门</h3>
                <p className="mt-1 text-xs text-slate-500">选择 L1 后查看下级组织。</p>
              </div>
              {mode === "drawer" && (
                <button
                  type="button"
                  onClick={() => setTreeDrawerOpen(false)}
                  className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
                >
                  关闭
                </button>
              )}
            </div>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜索部门、编码"
              size="page"
            />
          </div>
        </div>
        <div className={`${mode === "drawer" ? "h-[calc(100%-116px)]" : "max-h-[760px]"} overflow-auto p-3`}>
          {loading && <p className="py-8 text-center text-sm text-slate-400">加载中...</p>}
          {error && <p className="py-8 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && visibleRootDepartments.length === 0 && (
            <EmptyStateCard>暂无部门</EmptyStateCard>
          )}
          {!loading && !error && visibleRootDepartments.length > 0 && (
            <div className="grid gap-2">
              {visibleRootDepartments.map((department) => renderOrganizationRoot(department))}
            </div>
          )}
        </div>
      </PanelCard>
    );
  }

  function renderArchivedBrowser() {
    const archivedItems: ArchiveSelectorItem[] = archivedTab === "departments"
      ? archivedDepartments.map((department) => ({
        id: department.id,
        title: department.name,
        code: department.code,
        badge: <HierarchyBadge level={department.level} />,
        meta: `上级：${department.parentName || "-"} · 归档：${formatArchiveTime(department.archivedAt)}`,
      }))
      : archivedPositions.map((position) => ({
        id: position.id,
        title: position.name,
        code: position.code,
        badge: <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-blue-700">{shortPositionCode(position.code)}</span>,
        meta: `部门：${position.departmentName || "-"} · 归档：${formatArchiveTime(position.archivedAt)}`,
      }));
    const activeItemId = archivedTab === "departments"
      ? selection?.type === "department" ? selection.id : null
      : selection?.type === "position" ? selection.id : null;

    return (
      <div className="space-y-5">
        <SplitWorkspaceToolbar
          sideOpen={treeOpen}
          sideLabel="归档部门岗位"
          onSideOpenChange={setTreeOpen}
          onDrawerOpen={() => setTreeDrawerOpen(true)}
        >
          <button
            type="button"
            onClick={() => {
              setShowArchived(false);
              setSearch("");
              setSelection(null);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            现用部门岗位
          </button>
        </SplitWorkspaceToolbar>

        <SplitWorkspace
          sideOpen={treeOpen}
          drawerOpen={treeDrawerOpen}
          onDrawerOpenChange={setTreeDrawerOpen}
          renderSide={(mode) => (
            <ArchiveSelectorPanel
              title="归档部门岗位"
              subtitle="按归档时间倒序。"
              className={mode === "drawer" ? "h-full overflow-hidden" : ""}
              tabs={[
                { id: "departments", label: "归档部门", count: archivedDepartments.length },
                { id: "positions", label: "归档岗位", count: archivedPositions.length },
              ]}
              activeTab={archivedTab}
              onTabChange={(tab) => setArchivedTab(tab)}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="搜索名称、编码、所属部门"
              items={archivedItems}
              activeItemId={activeItemId}
              emptyText={archivedTab === "departments" ? "暂无归档部门" : "暂无归档岗位"}
              onClose={mode === "drawer" ? () => setTreeDrawerOpen(false) : undefined}
              onItemSelect={(item) => {
                selectItem({
                  type: archivedTab === "departments" ? "department" : "position",
                  id: Number(item.id),
                });
              }}
            />
          )}
        >
          {renderDetailPane()}
        </SplitWorkspace>

        <Toast
          message={toast?.message || ""}
          type={toast?.type}
          show={!!toast}
          onClose={() => setToast(null)}
        />
      </div>
    );
  }

  if (isOrganizationMode) {
    const activeOrganizationChildren = activeOrganizationRoot
      ? departments.filter((item) => item.parentId === activeOrganizationRoot.id).sort((a, b) => a.id - b.id)
      : [];

    return (
      <div className="space-y-5">
        <SplitWorkspaceToolbar
          sideOpen={treeOpen}
          sideLabel="一级部门"
          onSideOpenChange={setTreeOpen}
          onDrawerOpen={() => setTreeDrawerOpen(true)}
        >
          <button
            type="button"
            onClick={() => setCollapsedDepartments((prev) => {
              const next = new Set(prev);
              if (activeOrganizationRoot) next.delete(activeOrganizationRoot.id);
              return next;
            })}
            disabled={!activeOrganizationRoot}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            展开当前
          </button>
          <button
            type="button"
            onClick={() => setCollapsedDepartments((prev) => {
              const next = new Set(prev);
              if (activeOrganizationRoot) next.add(activeOrganizationRoot.id);
              return next;
            })}
            disabled={!activeOrganizationRoot}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            收起当前
          </button>
        </SplitWorkspaceToolbar>

        <SplitWorkspace
          sideOpen={treeOpen}
          drawerOpen={treeDrawerOpen}
          onDrawerOpenChange={setTreeDrawerOpen}
          renderSide={renderOrganizationRootPanel}
        >
          <PanelCard className="min-h-[520px]" bodyClassName="p-4">
            {loading && <p className="py-10 text-center text-sm text-slate-400">加载中...</p>}
            {error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
            {!loading && !error && !activeOrganizationRoot && (
              <EmptyStateCard>
                {visibleRootDepartments.length === 0 ? "暂无部门" : "请选择左侧一级部门"}
              </EmptyStateCard>
            )}
            {!loading && !error && activeOrganizationRoot && (
              <>
                <div className="mb-4 flex min-w-0 items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <h3 className="truncate text-lg font-semibold text-slate-900">{activeOrganizationRoot.name}</h3>
                      <span className="shrink-0 font-mono text-sm text-slate-400">{activeOrganizationRoot.code}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">右侧只展示组织层级；部门和岗位维护请到“部门岗位”。</p>
                  </div>
                  <HierarchyBadge level={activeOrganizationRoot.level} className="px-2.5 py-1" />
                </div>
                {collapsedDepartments.has(activeOrganizationRoot.id) ? (
                  <EmptyStateCard>当前一级部门已收起</EmptyStateCard>
                ) : activeOrganizationChildren.length > 0 ? (
                  <div className="max-w-4xl">
                    {activeOrganizationChildren.map((child) => renderOrganizationBranch(child, 1))}
                  </div>
                ) : (
                  <EmptyStateCard>暂无下级部门</EmptyStateCard>
                )}
              </>
            )}
          </PanelCard>
        </SplitWorkspace>
      </div>
    );
  }

  if (showArchived) {
    return renderArchivedBrowser();
  }

  return (
    <div className="space-y-5">
      <SplitWorkspaceToolbar
        sideOpen={treeOpen}
        sideLabel="部门岗位"
        onSideOpenChange={setTreeOpen}
        onDrawerOpen={() => setTreeDrawerOpen(true)}
      >
        <button
          type="button"
          onClick={() => {
            setShowArchived((value) => !value);
            setCreatePanel(null);
            setSelection(null);
            setArchivedTab("departments");
          }}
          className={getToolbarActionClassName("secondary")}
        >
          {showArchived ? "现用部门岗位" : "归档部门岗位"}
        </button>
        <button
          type="button"
          disabled={!canEditDepartment}
          onClick={() => setCreatePanel((panel) => panel === "department" ? null : "department")}
          className={getToolbarActionClassName("primary")}
        >
          新建部门
        </button>
        <button
          type="button"
          disabled={!canEditPosition}
          onClick={() => setCreatePanel((panel) => panel === "position" ? null : "position")}
          className={getToolbarActionClassName("primary")}
        >
          新建岗位
        </button>
      </SplitWorkspaceToolbar>

      {createPanel === "department" && (
        <InlineCreatePanel
          title="新建部门"
          onSubmit={() => void createDepartment()}
          onCancel={() => setCreatePanel(null)}
          submitDisabled={!newDepartmentDraft.name.trim() || Boolean(createDepartmentCodeError) || saving}
          submitting={saving}
          fieldsClassName="grid grid-cols-1 gap-3 lg:grid-cols-[110px_180px_180px_190px_auto] lg:items-start"
        >
                <label className="flex flex-col gap-1">
                  <span className="block h-5 text-xs font-medium leading-5 text-slate-500">部门层级</span>
                  <SelectField
                    value={String(newDepartmentDraft.level)}
                    onChange={(nextValue) => {
                      const level = Number(nextValue) as 1 | 2 | 3;
                      setNewDepartmentDraft({ level, parentId: null, code: "", name: newDepartmentDraft.name });
                    }}
                    options={[
                      { value: "1", label: "L1" },
                      { value: "2", label: "L2" },
                      { value: "3", label: "L3" },
                    ]}
                    selectClassName="h-10 px-3 py-0 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="block h-5 text-xs font-medium leading-5 text-slate-500">上级部门</span>
                  <SelectField
                    value={newDepartmentDraft.parentId == null ? "" : String(newDepartmentDraft.parentId)}
                    disabled={newDepartmentDraft.level === 1}
                    onChange={(nextValue) => setNewDepartmentDraft((prev) => ({ ...prev, parentId: nextValue ? Number(nextValue) : null, code: "" }))}
                    placeholder={newDepartmentDraft.level === 1 ? "无" : `选择 L${newDepartmentDraft.level - 1} 部门`}
                    options={createDepartmentParentOptions.map((department) => ({
                      value: String(department.id),
                      label: department.name,
                    }))}
                    selectClassName="h-10 px-3 py-0 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="block h-5 text-xs font-medium leading-5 text-slate-500">部门名</span>
                  <input
                    value={newDepartmentDraft.name}
                    onChange={(event) => setNewDepartmentDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="输入部门名"
                    className={compactFormInputClassName}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="block h-5 text-xs font-medium leading-5 text-slate-500">部门编码</span>
                  <div
                    title={createDepartmentCodeFieldError || undefined}
                    className={`flex h-10 w-fit max-w-full overflow-hidden rounded-md border bg-white font-mono text-sm focus-within:ring-1 ${
                      createDepartmentCodeFieldError
                        ? "border-red-300 focus-within:border-red-500 focus-within:ring-red-500"
                        : "border-slate-300 focus-within:border-emerald-500 focus-within:ring-emerald-500"
                    }`}
                  >
                    {createDepartmentCodeAffixes.prefix && (
                      <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-slate-500">
                        {createDepartmentCodeAffixes.prefix}
                      </span>
                    )}
                    <input
                      value={newDepartmentDraft.code}
                      onChange={(event) => setNewDepartmentDraft((prev) => ({ ...prev, code: normalizeDepartmentCodeInput(prev.level, event.target.value) }))}
                      placeholder={createDepartmentCodeInputDisabled ? "先选上级" : departmentCodePlaceholder(newDepartmentDraft.level)}
                      disabled={createDepartmentCodeInputDisabled}
                      aria-label="部门编码"
                      className={`${newDepartmentDraft.level === 1 ? "w-[6ch] min-w-[6ch]" : "w-[4.5ch] min-w-[4.5ch]"} h-full border-0 bg-white px-2 py-0 text-center font-mono text-sm focus:outline-none disabled:w-24 disabled:text-left disabled:bg-slate-50 disabled:text-slate-400`}
                    />
                    {createDepartmentCodeAffixes.suffix && (
                      <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-slate-500">
                        {createDepartmentCodeAffixes.suffix}
                      </span>
                    )}
                  </div>
                </label>
        </InlineCreatePanel>
      )}

      {createPanel === "position" && (
        <InlineCreatePanel
          title="新建岗位"
          onSubmit={() => void createPosition()}
          onCancel={() => setCreatePanel(null)}
          submitDisabled={!createPositionDraft.departmentId || !createPositionDraft.name.trim() || !createPositionCode || saving}
          submitting={saving}
        >
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">所属部门</span>
                  <EntitySearchInput
                    entity="department"
                    value={createPositionDraft.departmentId == null ? "" : String(createPositionDraft.departmentId)}
                    displayValue={departmentPath(createPositionDepartment, departmentById)}
                    placeholder="搜索所属部门"
                    onChange={(_label, option?: SearchOption) => setCreatePositionDraft((prev) => ({ ...prev, departmentId: option?.id ?? null }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">岗位名</span>
                  <input
                    value={createPositionDraft.name}
                    onChange={(event) => setCreatePositionDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="输入岗位名"
                    className={formInputClassName}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">岗位编码</span>
                  <input
                    value={createPositionCode}
                    disabled
                    className={getReadOnlyFieldClassName("font-mono")}
                  />
                </label>
        </InlineCreatePanel>
      )}

      <SplitWorkspace
        sideOpen={treeOpen}
        drawerOpen={treeDrawerOpen}
        onDrawerOpenChange={setTreeDrawerOpen}
        renderSide={renderTreePanel}
      >
        <PanelCard className="min-h-[520px]" bodyClassName="p-4">
          {!selection && <p className="py-12 text-center text-sm text-slate-400">选择部门或岗位查看详情</p>}
          {selectedDepartment && (
            <div className="space-y-4">
              {!isOrganizationMode && (
                renderDirectPositionPanel(selectedDepartment.id)
              )}
              <PanelCard bodyClassName="p-4">
                {sectionTitle(
                  "部门信息",
                  <div className="flex items-center gap-2">
                    {canEditDepartment && departmentDirty && <span className="text-xs text-amber-600">有未保存修改</span>}
                    <HierarchyBadge level={selectedDepartment.level} />
                  </div>
                )}
                {departmentDraft && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)]">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-500">部门编码</span>
                        <input
                          value={selectedDepartment.code}
                          disabled
                          className={readOnlyInputClassName}
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-500">完整路径 / 部门名称</span>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${showArchived ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                              {showArchived ? "已归档" : "现用"}
                            </span>
                            {canEdit && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void setDepartmentArchived(selectedDepartment.id, !showArchived)}
                                className={smallSecondaryActionClassName}
                              >
                                {showArchived ? "恢复部门" : "归档部门"}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex h-10 w-full overflow-hidden rounded-md border border-slate-300 bg-white text-sm shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                          {selectedDepartmentParentPath && (
                            <span
                              title={selectedDepartmentParentPath}
                              className="flex max-w-[60%] items-center truncate border-r border-slate-200 bg-slate-50 px-3 text-slate-500"
                            >
                              {selectedDepartmentParentPath} /
                            </span>
                          )}
                          <input
                            value={departmentDraft.name}
                            disabled={!canEditDepartment}
                            onChange={(event) => updateDepartmentDraft("name", event.target.value)}
                            className="min-w-0 flex-1 border-0 bg-white px-3 text-sm text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">别名</span>
                      <PositionAliasTagsInput
                        value={departmentDraft.alias}
                        disabled={!canEditDepartment}
                        onChange={(value) => updateDepartmentDraft("alias", value)}
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-500">部门负责人</span>
                        <EntitySearchInput
                          entity="position"
                          value={departmentDraft.managerPositionName}
                          displayValue={departmentDraft.managerPositionName}
                          disabled={!canEditDepartment}
                          placeholder="搜索部门负责人"
                          onChange={(_label, option?: SearchOption) => {
                            updateDepartmentDraft("managerPositionName", selectedEntityName("position", option));
                          }}
                        />
                      </label>
                    </div>
                    <DetailStatsRow
                      items={[
                        { label: "直属岗位", value: selectedDepartmentStats?.directPositions ?? 0 },
                        { label: "总岗位", value: selectedDepartmentStats?.totalPositions ?? 0 },
                        { label: "直属编制", value: selectedDepartmentStats?.directHeadcount ?? 0 },
                        { label: "总编制", value: selectedDepartmentStats?.totalHeadcount ?? 0 },
                      ]}
                    />
                    {canEditDepartment && (
                      <div className="flex justify-end gap-2">
                      {canEditDepartment && departmentDraft.managerPositionName && (
                        <button
                          type="button"
                          onClick={() => {
                            updateDepartmentDraft("managerPositionName", "");
                          }}
                          className={getToolbarActionClassName("secondary")}
                        >
                          清空负责人
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canEditDepartment || !departmentDirty || saving}
                        onClick={saveDepartmentInfo}
                        className={getToolbarActionClassName("primary")}
                      >
                        {saving ? "保存中..." : "保存部门信息"}
                      </button>
                      </div>
                    )}
                  </div>
                )}
              </PanelCard>
              {!isOrganizationMode && (
                <PanelCard bodyClassName="p-4">
                {sectionTitle(
                  "部门说明书",
                  departmentDescriptionDirty && <span className="text-xs text-amber-600">有未保存修改</span>
                )}
                <div className="space-y-5">
                  {departmentDescriptionDrafts.map((departmentDescriptionDraft, index) => (
                    <div key={departmentDescriptionDraft.id || `new-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 text-sm font-semibold text-slate-900">{departmentDescriptionDraft.name || `部门说明书 ${index + 1}`}</div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <DepartmentDescriptionDetailsEditor
                          value={departmentDescriptionDraft.details}
                          disabled={!canEditDepartment}
                          managerPositionName={departmentDraft?.managerPositionName || ""}
                          onChange={(value) => updateDepartmentDescriptionDraft(index, "details", value)}
                        />
                      </div>
                    </div>
                  ))}
                  {departmentDescriptionDrafts.length === 0 && (
                    <EmptyStateCard compact>暂无部门说明书</EmptyStateCard>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={!canEditDepartment || !departmentDescriptionDirty || saving}
                    onClick={saveDepartmentDescription}
                    className={getToolbarActionClassName("primary")}
                  >
                    {saving ? "保存中..." : "保存部门说明书"}
                  </button>
                </div>
                </PanelCard>
              )}
            </div>
          )}
          {!isOrganizationMode && selectedPosition && renderPositionEditor()}
        </PanelCard>
      </SplitWorkspace>

      <Toast
        message={toast?.message || ""}
        type={toast?.type}
        show={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
