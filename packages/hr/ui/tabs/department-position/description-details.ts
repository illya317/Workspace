import type { PickerOption } from "@workspace/core/ui";

export const DETAIL_FIELD_ORDER = [
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

export const DETAIL_FIELD_LABELS: Record<string, string> = {
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

export const EDUCATION_REQUIREMENT_OPTIONS = ["博士及以上", "硕士及以上", "本科及以上", "大专及以上", "无要求"];

export const HIDDEN_POSITION_DETAIL_KEYS = new Set([
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

export type PositionDescriptionTemplateId = string;
export type PositionDescriptionTemplateGroup = "base" | "qualification" | "duties" | "managementDuties" | "flow" | "history" | "rest";

export type PositionDescriptionTemplate = {
  id: PositionDescriptionTemplateId;
  label: string;
  groups: PositionDescriptionTemplateGroup[];
  fields?: string[];
  custom?: boolean;
};

export const NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION = "__new_position_description_template__";
export const POSITION_DESCRIPTION_BASE_DETAIL_KEYS = ["purpose", "scope", "subordinates", "rank", "salaryType", "officeLocation", "workSchedule"];
export const POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS = ["education", "major", "experienceRequirements", "cert", "skills", "competencies", "training", "otherRequirements", "workEnvironments", "equipment", "externalCollaboration"];
export const POSITION_DESCRIPTION_FLOW_DETAIL_KEYS = ["distributionDeptNames", "trainingPositionNames", "drafter", "reviewer1", "reviewer2", "approver"];

export const COMMON_POSITION_DESCRIPTION_TEMPLATE: PositionDescriptionTemplate = {
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

export const POSITION_DESCRIPTION_DEFAULT_TEMPLATES: PositionDescriptionTemplate[] = [
  COMMON_POSITION_DESCRIPTION_TEMPLATE,
  {
    id: "full",
    label: "完整模板",
    groups: ["base", "qualification", "duties", "managementDuties", "flow", "history", "rest"],
  },
];

export const POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS: Array<{ label: string; fields: string[] }> = [
  { label: "说明书基础", fields: POSITION_DESCRIPTION_BASE_DETAIL_KEYS },
  { label: "任职资格", fields: POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS },
  { label: "职责", fields: ["duties", "managementDuties"] },
  { label: "流转审批", fields: POSITION_DESCRIPTION_FLOW_DETAIL_KEYS },
  { label: "变更历史", fields: ["changeHistory"] },
];

export function positionDescriptionTemplateFields(template: PositionDescriptionTemplate) {
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

export function sanitizePositionDescriptionTemplate(input: unknown): PositionDescriptionTemplate | null {
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

export function mergePositionDescriptionTemplates(storedTemplates: PositionDescriptionTemplate[]) {
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

export function isDefaultPositionDescriptionTemplate(id: string) {
  return POSITION_DESCRIPTION_DEFAULT_TEMPLATES.some((template) => template.id === id);
}

export const POSITION_DETAIL_DEFAULTS: Record<string, unknown> = {
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

export function cloneDefaultDetailValue(value: unknown) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") return JSON.parse(JSON.stringify(value));
  return value;
}

export function normalizePositionDetails(details: Record<string, unknown>) {
  const normalized = { ...details };
  for (const key of DETAIL_FIELD_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = cloneDefaultDetailValue(POSITION_DETAIL_DEFAULTS[key]);
    }
  }
  return normalized;
}

export function parseDetailsObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function isPrimitiveArray(value: unknown): value is Array<string | number | boolean | null> {
  return Array.isArray(value) && value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
}

export function detailValueToText(value: unknown) {
  if (isPrimitiveArray(value)) return value.map((item) => item === null ? "" : String(item)).join("\n");
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return value === null || value === undefined ? "" : String(value);
}

export function textToDetailValue(previousValue: unknown, raw: string) {
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

export function detailFieldRows(value: unknown) {
  if (value && typeof value === "object" && !isPrimitiveArray(value)) return 8;
  if (isPrimitiveArray(value)) return Math.min(6, Math.max(3, value.length));
  const length = String(value || "").length;
  return length > 60 ? 3 : 1;
}

export function normalizeTextItem(value: string) {
  return value.trim().replace(/[\s；;。]+$/g, "");
}

export function primitiveListItems(value: unknown) {
  if (isPrimitiveArray(value)) return value.map((item) => normalizeTextItem(item === null ? "" : String(item)));
  if (typeof value === "string") {
    return value
      .split(/\n+|[；;、，,]+/)
      .map(normalizeTextItem)
      .filter(Boolean);
  }
  return [];
}

export const SALARY_TYPE_OPTIONS = ["固定薪资", "固定薪资+浮动绩效"];
export const WORK_SCHEDULE_OPTIONS = ["标准工时工作制", "综合计算工时制", "综合计时工作制", "无固定作息时间"];
export const WORK_AREA_OPTIONS = [
  "一般区",
  "有毒区",
  "D级区",
  "无毒区",
  "洁净区",
  "B+A区",
  "GMP洁净车间",
  "C级区",
];
export const ENVIRONMENT_FACTOR_OPTIONS = [
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

export function pickerOptions(values: string[]): PickerOption[] {
  return values.map((value) => ({ label: value, value }));
}
