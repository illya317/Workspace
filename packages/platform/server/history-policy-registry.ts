import os from "os";
import path from "path";
import { readFile } from "fs/promises";
import { FIELD_LABELS } from "../audit/field-labels";
import type { PrismaClient } from "./prisma";

type PrismaModelKey = Extract<keyof PrismaClient, string>;

export type HistoryClient = Pick<PrismaClient, "editHistory"> & Record<string, unknown>;

export type HistoryChange = {
  field: string;
  label?: string;
  from?: string;
  to: string;
};

export type HistorySummaryContext = {
  entityType: string;
  previous: Record<string, unknown> | null;
  current: Record<string, unknown>;
  fkMap: Record<string, string>;
  labelField: (field: string) => string;
  formatValue: (field: string, value: unknown) => string;
};

type HistoryModelDelegate = {
  findUnique: (args: { where: { id: number } }) => Promise<Record<string, unknown> | null>;
  findMany?: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  update?: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<unknown>;
  create?: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

export type HistoryDisplayPolicy = {
  field?: string;
  fallback: string;
  resolveNames?: (ids: number[], client: HistoryClient) => Promise<Record<string, string>>;
};

export type HistoryRestorePolicy = {
  mode: "update-or-create";
  omitFields?: readonly string[];
  auditMetadata?: "standard" | "none";
  sanitizeSnapshot?: (data: Record<string, unknown>) => Record<string, unknown>;
};

export type HistoryPolicy = {
  entityType: string;
  modelKey: PrismaModelKey;
  trackHistory: true;
  baseline: "before-first-update" | "never";
  displayName: HistoryDisplayPolicy;
  fieldLabels?: Record<string, string>;
  ignoredFields?: readonly string[];
  restore: false | HistoryRestorePolicy;
  prepareSnapshot?: (record: Record<string, unknown>, client: HistoryClient) => Promise<Record<string, unknown>>;
  summarizeChanges?: (context: HistorySummaryContext) => HistoryChange[];
};

const AUDIT_FIELDS = ["editedBy", "editedAt", "version", "editor", "createdAt", "updatedAt", "id"] as const;
const EMPLOYMENT_CONTRACT_FIELDS = [
  "company",
  "isPrimary",
  "insuranceStatus",
  "legalRelation",
  "contractType",
  "employmentForm",
  "firstContractStartDate",
  "firstContractEndDate",
  "secondContractStartDate",
  "secondContractEndDate",
  "thirdContractStartDate",
  "thirdContractEndDate",
  "permanentContractDate",
  "confidentialityDate",
  "nonCompeteDate",
  "endDate",
] as const;

const RESTORE_UPDATE_OR_CREATE = {
  mode: "update-or-create",
  omitFields: AUDIT_FIELDS,
  auditMetadata: "standard",
} as const satisfies HistoryRestorePolicy;
const RESTORE_UPDATE_OR_CREATE_WITHOUT_AUDIT_METADATA = {
  mode: "update-or-create",
  omitFields: AUDIT_FIELDS,
  auditMetadata: "none",
} as const satisfies HistoryRestorePolicy;

function getDelegate(client: HistoryClient, modelKey: PrismaModelKey): HistoryModelDelegate {
  return (client as unknown as Record<string, HistoryModelDelegate>)[modelKey];
}

async function resolveEdpNames(ids: number[], client: HistoryClient) {
  const records = await getDelegate(client, "eDP").findMany?.({
    where: { id: { in: ids } },
    include: { employee: { select: { name: true } } },
  });
  const map: Record<string, string> = {};
  for (const record of records ?? []) {
    const employee = record.employee as { name?: string } | undefined;
    map[String(record.id)] = employee?.name || String(record.id);
  }
  return map;
}

async function resolveEmployeeProjectNames(ids: number[], client: HistoryClient) {
  const records = await getDelegate(client, "employeeProject").findMany?.({
    where: { id: { in: ids } },
    include: {
      employee: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
  const map: Record<string, string> = {};
  for (const record of records ?? []) {
    const employee = record.employee as { name?: string } | undefined;
    const project = record.project as { name?: string } | undefined;
    map[String(record.id)] = `${employee?.name || "?"} / ${project?.name || "?"}`;
  }
  return map;
}

async function resolveEmploymentNames(ids: number[], client: HistoryClient) {
  const records = await getDelegate(client, "employment").findMany?.({
    where: { id: { in: ids } },
    include: { employee: { select: { name: true } } },
  });
  const map: Record<string, string> = {};
  for (const record of records ?? []) {
    const employee = record.employee as { name?: string } | undefined;
    map[String(record.id)] = employee?.name || String(record.id);
  }
  return map;
}

const employeeLabels = {
  employeeId: "员工编号",
  name: "姓名",
  alias: "别名",
  userId: "关联账号",
} satisfies Record<string, string>;

const financeAccountLabels = {
  code: "科目编码",
  name: "科目名称",
  category: "科目类别",
  parentId: "上级科目",
  balanceDirection: "余额方向",
  companyCode: "公司编码",
  mnemonicCode: "助记码",
  currency: "币种",
  groupSubjectCode: "集团科目编码",
  subjectLevel: "科目层级",
  reclassTargetCode: "重分类目标科目",
} satisfies Record<string, string>;

const documentTemplateLabels = {
  title: "模板名称",
  type: "模板类型",
  status: "状态",
  spaceId: "模板空间",
  sourceKind: "来源类型",
  sourceProductKey: "来源标识",
  publishedAt: "发布时间",
  publishedByUserId: "发布人",
} satisfies Record<string, string>;

async function prepareDocumentTemplateSnapshot(record: Record<string, unknown>) {
  const content = await readDocumentTemplateContentJson(record);
  return {
    ...record,
    documentJson: content.documentJson,
    fieldModelJson: content.fieldModelJson,
  };
}

async function readDocumentTemplateContentJson(record: Record<string, unknown>) {
  const [documentContent, fieldModelContent] = await Promise.all([
    readDocumentTemplateContentRef(typeof record.documentContentRef === "string" ? record.documentContentRef : null),
    readDocumentTemplateContentRef(typeof record.fieldModelContentRef === "string" ? record.fieldModelContentRef : null),
  ]);
  return {
    documentJson: documentContent ?? "{}",
    fieldModelJson: fieldModelContent ?? "{}",
  };
}

async function readDocumentTemplateContentRef(ref: string | null) {
  if (!ref) return null;
  const rootRef = "data/docs-editor/templates";
  if (path.isAbsolute(ref) || ref.includes("..") || !ref.startsWith(`${rootRef}/`)) return null;
  const configured = process.env["WORKSPACE_CONFIG_DIR"]?.trim();
  if (!configured) return null;
  const root = configured === "~" ? os.homedir() : configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return readFile(path.join(root, ...ref.split("/")), "utf8").catch(() => null);
}

function parseContractSnapshots(value: unknown) {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
  } catch {}
  return [];
}

function summarizeEmploymentChanges(context: HistorySummaryContext) {
  const changes: HistoryChange[] = [];
  const keys = new Set([...Object.keys(context.current), ...(context.previous ? Object.keys(context.previous) : [])]);
  for (const key of keys) {
    if (shouldIgnoreHistoryField(getHistoryPolicy(context.entityType), key)) continue;
    if (key === "contracts") {
      const previousContracts = parseContractSnapshots(context.previous?.contracts);
      const currentContracts = parseContractSnapshots(context.current.contracts);
      const count = Math.max(previousContracts.length, currentContracts.length);
      for (let index = 0; index < count; index += 1) {
        const previousContract = previousContracts[index] || {};
        const currentContract = currentContracts[index] || {};
        for (const field of EMPLOYMENT_CONTRACT_FIELDS) {
          const oldValue = previousContract[field];
          const newValue = currentContract[field];
          if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
          changes.push({
            field: `contracts.${index}.${field}`,
            label: `合同${index + 1} · ${context.labelField(field)}`,
            from: context.formatValue(field, oldValue),
            to: context.formatValue(field, newValue),
          });
        }
      }
      continue;
    }

    const oldValue = context.previous?.[key];
    const newValue = context.current[key];
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
    changes.push({
      field: key,
      label: context.labelField(key),
      from: context.formatValue(key, oldValue),
      to: context.formatValue(key, newValue),
    });
  }
  return changes;
}

export const historyPolicyRegistry = {
  Employee: {
    entityType: "Employee",
    modelKey: "employee",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知员工" },
    fieldLabels: employeeLabels,
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
  },
  Employment: {
    entityType: "Employment",
    modelKey: "employment",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { fallback: "未知雇佣", resolveNames: resolveEmploymentNames },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
    summarizeChanges: summarizeEmploymentChanges,
  },
  Company: {
    entityType: "Company",
    modelKey: "company",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知公司" },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
  },
  CompanyRelation: {
    entityType: "CompanyRelation",
    modelKey: "companyRelation",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "id", fallback: "未知关系" },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE_WITHOUT_AUDIT_METADATA,
  },
  Department: {
    entityType: "Department",
    modelKey: "department",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知部门" },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
  },
  Position: {
    entityType: "Position",
    modelKey: "position",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知岗位" },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
  },
  EDP: {
    entityType: "EDP",
    modelKey: "eDP",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { fallback: "未知关联", resolveNames: resolveEdpNames },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
  },
  Project: {
    entityType: "Project",
    modelKey: "project",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知项目" },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
  },
  EmployeeProject: {
    entityType: "EmployeeProject",
    modelKey: "employeeProject",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { fallback: "未知关联", resolveNames: resolveEmployeeProjectNames },
    ignoredFields: AUDIT_FIELDS,
    restore: RESTORE_UPDATE_OR_CREATE,
  },
  ProjectTask: {
    entityType: "ProjectTask",
    modelKey: "projectTask",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知任务" },
    ignoredFields: AUDIT_FIELDS,
    restore: false,
  },
  PositionDescription: {
    entityType: "PositionDescription",
    modelKey: "positionDescription",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知岗位说明书" },
    ignoredFields: AUDIT_FIELDS,
    restore: false,
  },
  FinanceAccount: {
    entityType: "FinanceAccount",
    modelKey: "financeAccount",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "name", fallback: "未知科目" },
    fieldLabels: financeAccountLabels,
    ignoredFields: AUDIT_FIELDS,
    restore: false,
  },
  DocumentTemplate: {
    entityType: "DocumentTemplate",
    modelKey: "documentTemplate",
    trackHistory: true,
    baseline: "before-first-update",
    displayName: { field: "title", fallback: "未知模板" },
    fieldLabels: documentTemplateLabels,
    ignoredFields: [
      "id",
      "version",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "documentContentRef",
      "fieldModelContentRef",
    ],
    restore: false,
    prepareSnapshot: prepareDocumentTemplateSnapshot,
  },
} as const satisfies Record<string, HistoryPolicy>;

export type HistoryEntityType = keyof typeof historyPolicyRegistry;

export function getHistoryPolicy(entityType: string): HistoryPolicy | undefined {
  return (historyPolicyRegistry as Record<string, HistoryPolicy>)[entityType];
}

export function assertTrackedHistoryPolicy(entityType: string, caller = "history"): HistoryPolicy {
  const policy = getHistoryPolicy(entityType);
  if (!policy?.trackHistory) {
    throw new Error(
      `[${caller}] 未注册的 entityType: "${entityType}"。请在 @workspace/platform/server/history-policy-registry 中添加策略。`,
    );
  }
  return policy;
}

export function getHistoryModelDelegate(client: HistoryClient, policy: HistoryPolicy): HistoryModelDelegate {
  const delegate = getDelegate(client, policy.modelKey);
  if (!delegate || typeof delegate.findUnique !== "function") {
    throw new Error(`[historyPolicyRegistry] ${policy.entityType} 的 modelKey "${policy.modelKey}" 不存在或缺少 findUnique。`);
  }
  return delegate;
}

export function getRestorableHistoryPolicy(entityType: string): (HistoryPolicy & { restore: HistoryRestorePolicy }) | undefined {
  const policy = getHistoryPolicy(entityType);
  if (!policy || policy.restore === false) return undefined;
  return policy as HistoryPolicy & { restore: HistoryRestorePolicy };
}

export function labelHistoryField(entityType: string, field: string) {
  const policy = getHistoryPolicy(entityType);
  return policy?.fieldLabels?.[field] ?? FIELD_LABELS[field] ?? field;
}

export function shouldIgnoreHistoryField(policy: HistoryPolicy | undefined, field: string) {
  const ignored = policy?.ignoredFields ?? AUDIT_FIELDS;
  return (ignored as readonly string[]).includes(field);
}

export function buildHistoryRestoreData(policy: HistoryPolicy & { restore: HistoryRestorePolicy }, snapshotData: Record<string, unknown>) {
  const data = { ...snapshotData };
  for (const field of policy.restore.omitFields ?? []) delete data[field];
  return policy.restore.sanitizeSnapshot ? policy.restore.sanitizeSnapshot(data) : data;
}

export function buildHistoryRestoreAuditMetadata(
  policy: HistoryPolicy & { restore: HistoryRestorePolicy },
  userId: number,
  mode: "create" | "update",
  now = new Date(),
) {
  if (policy.restore.auditMetadata === "none") return {};
  return mode === "update"
    ? { editedBy: userId, editedAt: now, version: { increment: 1 } }
    : { editedBy: userId, editedAt: now, version: 1 };
}

function defaultHistoryValue(value: unknown) {
  if (value == null) return "(空)";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function summarizeHistoryChanges(
  entityType: string,
  previous: Record<string, unknown> | null,
  current: Record<string, unknown>,
  options: {
    fkMap?: Record<string, string>;
    formatValue?: (field: string, value: unknown) => string;
  } = {},
) {
  const policy = getHistoryPolicy(entityType);
  const context: HistorySummaryContext = {
    entityType,
    previous,
    current,
    fkMap: options.fkMap ?? {},
    labelField: (field) => labelHistoryField(entityType, field),
    formatValue: options.formatValue ?? ((_field, value) => defaultHistoryValue(value)),
  };
  if (policy?.summarizeChanges) return policy.summarizeChanges(context);
  if (!previous) return [];

  const changes: HistoryChange[] = [];
  const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  for (const key of keys) {
    if (shouldIgnoreHistoryField(policy, key)) continue;
    const oldValue = previous[key];
    const newValue = current[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        field: key,
        label: context.labelField(key),
        from: context.formatValue(key, oldValue),
        to: context.formatValue(key, newValue),
      });
    }
  }
  return changes;
}
