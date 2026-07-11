import type { ResourceTreeNode } from "../components/ResourceTree";
import {
  contractDefaultFlowType,
  contractDefaultHandlerSource,
  contractDefaultSeparationPolicy,
  type WorkflowActionContractDto,
} from "./WorkflowPoliciesContractModel";
import {
  workflowActionStatus,
  type BusinessActionEligibility,
  type WorkflowFlowType,
  type WorkflowHandlerSource,
  type WorkflowIntentDto,
  type WorkflowPolicyMode,
  type WorkflowProductStatus,
  type WorkflowProductState,
  type WorkflowReadinessDto,
  type WorkflowSeparationPolicy,
} from "./WorkflowPoliciesLabels";

export type WorkflowScopeType = "global" | "department" | "company" | "committee" | "personal" | "custom";

export {
  ACCESS_LABEL,
  canConfigureWorkflowAction,
  ELIGIBILITY_LABEL,
  FLOW_LABEL,
  handlerSourceLabel,
  MODE_LABEL,
  SEPARATION_LABEL,
  separationPolicyLabel,
  workflowAccessMode,
  workflowActionRoutingLabel,
  workflowActionRoutingTooltip,
  workflowActionStatus,
  workflowModeFromAccess,
  workflowSeparationMode,
} from "./WorkflowPoliciesLabels";
export type {
  BusinessActionEligibility,
  WorkflowAccessMode,
  WorkflowActionStatusKind,
  WorkflowActionStatusTone,
  WorkflowActionStatusView,
  WorkflowFlowType,
  WorkflowHandlerSource,
  WorkflowIntentDto,
  WorkflowPolicyMode,
  WorkflowProductStatus,
  WorkflowProductState,
  WorkflowReadinessDto,
  WorkflowSeparationPolicy,
} from "./WorkflowPoliciesLabels";

export interface BusinessActionApiRoute {
  method: string;
  path: string;
  notes?: string;
}

export interface BusinessActionDto {
  key: string;
  label: string;
  moduleKey: string;
  moduleLabel?: string;
  resourceKey: string;
  resourceLabel?: string;
  scopeTypes?: readonly WorkflowScopeType[];
  writeKind: string;
  targetKind: string;
  eligibility: BusinessActionEligibility;
  flowType?: WorkflowFlowType;
  separationPolicy?: WorkflowSeparationPolicy;
  directPermissionAction?: string;
  submitPermissionAction?: string;
  processPermissionAction?: string;
  originHrefPattern?: string;
  settingsSortOrder?: number;
  workflowCategoryKey?: string;
  apiRoutes?: readonly BusinessActionApiRoute[];
  notes?: string;
  workflowIntent: WorkflowIntentDto;
  workflowReadiness: WorkflowReadinessDto;
  productStatus: WorkflowProductStatus;
  workflowProductState: WorkflowProductState;
  workflowAdaptationState: "adapted" | "not_adapted";
  actionContract: WorkflowActionContractDto | null;
}

export interface WorkflowPolicyRow {
  id: number;
  businessActionKey: string;
  scopeType: string;
  scopeId: string;
  mode: WorkflowPolicyMode;
  flowType: WorkflowFlowType;
  separationPolicy: WorkflowSeparationPolicy;
  handlerSource: WorkflowHandlerSource;
  workflowNodes: WorkflowPolicyNodeDto[];
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  version: number;
  updatedAt: string;
}

type WorkflowPolicyAssigneeDto = { fieldKind: "relationship" | "position" | "employee"; value: string | null };
type WorkflowPolicyConditionDto = { fieldKind: "company" | "department"; value: string | null };
export type WorkflowPolicyNodeDto =
  | { key: string; kind: "approval"; assignees: WorkflowPolicyAssigneeDto[]; approvalMode: "any_one" | "all" }
  | { key: string; kind: "gateway"; gatewayKind: "exclusive" | "inclusive" | "parallel"; branches: WorkflowPolicyGatewayBranchDto[] };
export type WorkflowPolicyGatewayBranchDto = {
  key: string; label: string; order: number; conditions: WorkflowPolicyConditionDto[];
  assignees: WorkflowPolicyAssigneeDto[]; approvalMode: "any_one" | "all"; children: WorkflowPolicyNodeDto[];
};

export interface WorkflowPoliciesResponse {
  businessActions: BusinessActionDto[];
  workflowCategories: WorkflowCategoryDto[];
  policies: WorkflowPolicyRow[];
  companyOptions: WorkflowCompanyOptionDto[];
  departmentOptions: WorkflowDepartmentOptionDto[];
  employeeOptions: WorkflowEmployeeOptionDto[];
  positionOptions: WorkflowPositionOptionDto[];
  enums: {
    modes: WorkflowPolicyMode[];
    flowTypes: WorkflowFlowType[];
    separationPolicies: WorkflowSeparationPolicy[];
    handlerSources: WorkflowHandlerSource[];
  };
}

export interface WorkflowCategoryDto {
  key: string;
  label: string;
  sortOrder: number;
}

export interface WorkflowCompanyOptionDto {
  code: string;
  name: string;
  label: string;
  description?: string;
}

export interface WorkflowDepartmentOptionDto {
  id: number;
  code: string;
  name: string;
  label: string;
  description?: string;
}

export interface WorkflowEmployeeOptionDto {
  id: number;
  employeeId: string;
  name: string;
  label: string;
  description?: string;
}

export interface WorkflowPositionOptionDto {
  id: number;
  code: string;
  name: string;
  label: string;
  description?: string;
}

export interface WorkflowPolicyDraft {
  businessActionKey: string;
  scopeType: WorkflowScopeType;
  scopeId: string;
  mode: WorkflowPolicyMode;
  flowType: WorkflowFlowType;
  separationPolicy: WorkflowSeparationPolicy;
  handlerSource: WorkflowHandlerSource;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
}

export interface WorkflowActionTreeNode extends ResourceTreeNode {
  action?: BusinessActionDto;
}

export interface UseWorkflowPoliciesTabInput {
  enabled: boolean;
  showToast: (msg: string, type?: "success" | "error") => void;
}

const WRITE_KIND_LABEL: Record<string, string> = {
  create: "新建",
  save: "保存",
  update: "更新",
  delete: "删除",
  archive: "归档",
  revise: "修订",
  reverse: "撤回/冲销",
  submit: "提交",
  approve: "通过",
  reject: "驳回",
  import: "导入",
  export: "导出",
  system: "系统",
};

const TARGET_KIND_LABEL: Record<string, string> = {
  WorkPlan: "OKR/工作计划",
  WorkItem: "工作节点",
  WorkReport: "工作汇报",
  Project: "项目",
  EmployeeProject: "项目成员",
  ProjectPlanPhase: "项目阶段",
  ProjectPlanGantt: "项目甘特",
  ProjectPlanBaseline: "项目计划基线",
  DocumentTemplate: "文档模板",
  DocumentTemplateDraft: "文档模板草稿",
  QcBatch: "QC 批次",
  QcBatchPrecheck: "QC 预检记录",
  QcBatchInspection: "QC 检验记录",
  QcBatchReview: "QC 批次复核",
  QcBatchList: "QC 批次列表",
  Employee: "员工档案",
  EmployeeProfileContractRows: "员工详情合同",
  EmployeeProfileDepartmentPositionRows: "员工详情部门岗位",
  Department: "部门",
  Position: "岗位",
  HrRosterImport: "人事基础资料导入",
  HrRosterGeneratedExport: "花名册生成资料导出",
  FinanceStatementWorkpaper: "财务报表底稿",
  FinanceStatementReview: "财务报表校对",
  FinanceStatementReviewLine: "财务报表校对明细",
  FinanceAccount: "会计科目",
  FinanceVoucher: "凭证",
  FinancePeriod: "会计期间",
  FinanceLedgerDefaultBook: "默认账套",
  FinanceAccountBalance: "科目余额",
  FinanceBalanceReconcile: "余额校准",
  FinanceReclassRule: "重分类规则",
  ReclassResult: "重分类结果",
  FinanceStatementLineConfig: "报表项目配置",
  FinanceStatementAccountMapping: "报表科目映射",
  FinanceBudgetImport: "预算导入",
  BudgetVersion: "预算版本",
  FinanceCostImport: "成本导入",
  FinanceImport: "财务导入",
};

export function moduleDisplayName(action: BusinessActionDto) {
  return action.moduleLabel || action.moduleKey;
}

export function resourceDisplayName(action: BusinessActionDto) {
  return action.resourceLabel || action.resourceKey;
}

export function writeKindLabel(writeKind: string) {
  return WRITE_KIND_LABEL[writeKind] ?? writeKind;
}

export function targetKindLabel(targetKind: string) {
  return TARGET_KIND_LABEL[targetKind] ?? targetKind;
}

export function defaultDraftForAction(action: BusinessActionDto): WorkflowPolicyDraft {
  const workflow = action.actionContract?.workflow;
  const mutationPolicy = workflow?.kind === "configurable" || workflow?.kind === "native"
    ? workflow.mutationPolicy
    : undefined;
  return {
    businessActionKey: action.key,
    scopeType: defaultScopeType(action),
    scopeId: "",
    mode: defaultMode(action),
    flowType: contractDefaultFlowType(action) ?? action.flowType ?? "approval",
    separationPolicy: contractDefaultSeparationPolicy(action) ?? action.separationPolicy ?? "auto_pass_if_authorized",
    handlerSource: contractDefaultHandlerSource(action) ?? "permission",
    handlerCanRevise: mutationPolicy?.handlerCanRevise ?? true,
    requestCanWithdraw: mutationPolicy?.requestCanWithdraw ?? true,
    requestCanResubmit: mutationPolicy?.requestCanResubmit ?? true,
    requestCanCancel: mutationPolicy?.requestCanCancel ?? true,
    requestCanRevise: mutationPolicy?.requestCanRevise ?? true,
  };
}

export function draftFromPolicy(policy: WorkflowPolicyRow): WorkflowPolicyDraft {
  return {
    businessActionKey: policy.businessActionKey,
    scopeType: normalizeScopeType(policy.scopeType),
    scopeId: policy.scopeId,
    mode: policy.mode,
    flowType: policy.flowType,
    separationPolicy: policy.separationPolicy,
    handlerSource: policy.handlerSource,
    handlerCanRevise: policy.handlerCanRevise,
    requestCanWithdraw: policy.requestCanWithdraw,
    requestCanResubmit: policy.requestCanResubmit,
    requestCanCancel: policy.requestCanCancel,
    requestCanRevise: policy.requestCanRevise,
  };
}

export function initialDraftForAction(action: BusinessActionDto, policies: readonly WorkflowPolicyRow[]): WorkflowPolicyDraft {
  const selectedPolicy =
    policies.find((policy) => policy.scopeType === "global" && policy.scopeId === "") ??
    policies[0] ??
    null;
  return selectedPolicy ? draftFromPolicy(selectedPolicy) : defaultDraftForAction(action);
}

export function normalizeScopeType(value: string): WorkflowScopeType {
  if (value === "department" || value === "company" || value === "committee" || value === "personal" || value === "custom") return value;
  return "global";
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function actionSubtitle(action: BusinessActionDto) {
  return `${resourceDisplayName(action)} · ${targetKindLabel(action.targetKind)} · ${writeKindLabel(action.writeKind)}`;
}

export function inlineKeyText(label: string, value: string) {
  return value ? `${label}  ${value}` : label;
}

export function matchesQuery(action: BusinessActionDto, query: string) {
  const text = [
    action.key,
    action.label,
    action.moduleKey,
    action.moduleLabel,
    action.resourceKey,
    action.resourceLabel,
    action.targetKind,
    targetKindLabel(action.targetKind),
    action.writeKind,
    writeKindLabel(action.writeKind),
    ...(action.apiRoutes ?? []).map((route) => `${route.method} ${route.path}`),
  ].join(" ").toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

export function deriveActionTree(
  actions: BusinessActionDto[],
  policies: WorkflowPolicyRow[],
  categories: readonly WorkflowCategoryDto[],
): WorkflowActionTreeNode[] {
  const policiesByAction = new Map<string, WorkflowPolicyRow[]>();
  for (const policy of policies) {
    const list = policiesByAction.get(policy.businessActionKey) ?? [];
    list.push(policy);
    policiesByAction.set(policy.businessActionKey, list);
  }
  const actionsByCategory = new Map<string, BusinessActionDto[]>();
  for (const action of actions) {
    if (!action.workflowCategoryKey) continue;
    const categoryActions = actionsByCategory.get(action.workflowCategoryKey) ?? [];
    categoryActions.push(action);
    actionsByCategory.set(action.workflowCategoryKey, categoryActions);
  }

  return categories
    .filter((category) => actionsByCategory.has(category.key))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key))
    .map((category) => {
      const categoryActions = actionsByCategory.get(category.key) ?? [];
      return {
        key: `workflow-category:${category.key}`,
        name: category.label,
        statusLabel: `${categoryActions.length} 个`,
        statusVariant: "gray",
        selectableWithChildren: true,
        children: categoryActions
          .slice()
          .sort(compareWorkflowActions)
          .map((action) => workflowActionTreeNode(action, policiesByAction)),
      } satisfies WorkflowActionTreeNode;
    });
}

function workflowActionTreeNode(
  action: BusinessActionDto,
  policiesByAction: ReadonlyMap<string, WorkflowPolicyRow[]>,
): WorkflowActionTreeNode {
  const status = workflowActionStatus(action, policiesByAction.get(action.key));
  return {
    key: action.key,
    name: action.label,
    statusLabel: status.label,
    statusVariant: status.tone,
    action,
  };
}

export function firstAction(node: WorkflowActionTreeNode | null): BusinessActionDto | null {
  if (!node) return null;
  if (node.action) return node.action;
  for (const child of node.children ?? []) {
    const found = firstAction(child as WorkflowActionTreeNode);
    if (found) return found;
  }
  return null;
}

function compareWorkflowActions(left: BusinessActionDto, right: BusinessActionDto) { return (left.settingsSortOrder ?? Number.MAX_SAFE_INTEGER) - (right.settingsSortOrder ?? Number.MAX_SAFE_INTEGER) || left.key.localeCompare(right.key); }

function defaultMode(action: BusinessActionDto): WorkflowPolicyMode {
  const workflow = action.actionContract?.workflow;
  const workflowMode = workflow?.kind === "configurable" || workflow?.kind === "native"
    ? workflow.defaultExecutionMode
    : undefined;
  if (workflowMode === "workflow" || workflowMode === "native") return "required";
  if (workflowMode === "direct") return "permission_only";
  if (action.workflowProductState === "default_enabled") return "required";
  return "permission_only";
}

function defaultScopeType(action: BusinessActionDto): WorkflowScopeType { void action; return "global"; }
