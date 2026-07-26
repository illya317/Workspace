import type { ApiMethod } from "./api-contract-types";
import { assertBusinessActionRegistryValid } from "./business-action-registry-validation";
import type { PermissionActionKey } from "./permission-actions";
import { ADDITIONAL_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-additional";
import { WORK_OKR_CONTROL_CAPABILITY_KEY } from "./work-reporting-policy";
import type { WorkflowCategoryKey } from "./workflow-category-registry";

export type BusinessActionScopeType = "personal" | "department" | "committee" | "company";
export type BusinessActionWriteKind =
  | "create"
  | "save"
  | "update"
  | "delete"
  | "archive"
  | "revise"
  | "reverse"
  | "submit"
  | "approve"
  | "reject"
  | "import"
  | "export"
  | "system";
export type BusinessActionEligibility = "workflow_optional" | "workflow_required" | "permission_only" | "internal";
export type BusinessActionFlowType = "approval" | "review" | "publish";
export type BusinessActionSeparationPolicy = "independent_required" | "auto_pass_if_authorized";
export type BusinessActionSettingsVisibility = "visible" | "runtime_only";

export interface BusinessActionApiRoute {
  method: ApiMethod;
  path: string;
  notes?: string;
}

export interface BusinessActionRegistration {
  key: string;
  label: string;
  moduleKey: string;
  resourceKey: string;
  scopeTypes?: readonly BusinessActionScopeType[];
  writeKind: BusinessActionWriteKind;
  targetKind: string;
  eligibility: BusinessActionEligibility;
  flowType?: BusinessActionFlowType;
  separationPolicy?: BusinessActionSeparationPolicy;
  directPermissionAction?: PermissionActionKey;
  submitPermissionAction?: PermissionActionKey;
  processPermissionAction?: PermissionActionKey;
  iconStateProfile?: string;
  originHrefPattern?: string;
  settingsVisibility?: BusinessActionSettingsVisibility;
  settingsSortOrder?: number;
  workflowCategoryKey?: WorkflowCategoryKey;
  apiRoutes?: readonly BusinessActionApiRoute[];
  notes?: string;
}

const STANDARD_SPACE_SCOPES = ["personal", "department", "committee", "company"] as const;

const OPTIONAL_APPROVAL_AUTO = {
  eligibility: "workflow_optional",
  flowType: "approval",
  separationPolicy: "auto_pass_if_authorized",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const OPTIONAL_PUBLISH_AUTO = {
  eligibility: "workflow_optional",
  flowType: "publish",
  separationPolicy: "auto_pass_if_authorized",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const REQUIRED_REVIEW_INDEPENDENT = {
  eligibility: "workflow_required",
  flowType: "review",
  separationPolicy: "independent_required",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;

const WORK_TASKS = {
  moduleKey: "work",
  resourceKey: "work.tasks",
  scopeTypes: STANDARD_SPACE_SCOPES,
  originHrefPattern: "/work/me",
} as const;

const DOCS_EDITOR = {
  moduleKey: "docs",
  resourceKey: "docs.editor",
  scopeTypes: STANDARD_SPACE_SCOPES,
  originHrefPattern: "/docs/editor",
} as const;

const PRODUCTION_QC = {
  moduleKey: "production",
  resourceKey: "production.qc",
  originHrefPattern: "/production/qc",
} as const;

const HR_ROSTER = {
  moduleKey: "hr",
  resourceKey: "hr.roster",
  originHrefPattern: "/hr/roster",
} as const;

function route(method: ApiMethod, path: string, notes?: string): BusinessActionApiRoute {
  return notes ? { method, path, notes } : { method, path };
}

export const BUSINESS_ACTION_REGISTRATIONS = [
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.plan.create",
    label: "保存工作计划草稿",
    writeKind: "save",
    targetKind: "WorkPlan",
    directPermissionAction: "create",
    apiRoutes: [route("POST", "/api/modules/work/tasks/plans")],
    notes: "工作计划创建是草稿保存动作，不进入审批配置；期初目标提交流程走 work.tasks.goal.department.objective.submit / work.tasks.goal.personal.objective.submit。",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.plan.save",
    label: "保存工作计划草稿修改",
    writeKind: "save",
    targetKind: "WorkPlan",
    directPermissionAction: "update",
    apiRoutes: [route("PUT", "/api/modules/work/tasks/plans/:id")],
    notes: "审批前直接保存草稿；审批后实质修改走 work.tasks.goal.department.objective.revise / work.tasks.goal.personal.objective.revise。",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.plan.archive",
    label: "归档 OKR/工作计划",
    writeKind: "archive",
    targetKind: "WorkPlan",
    directPermissionAction: "archive",
    apiRoutes: [route("DELETE", "/api/modules/work/tasks/plans/:id")],
    notes: "Delete route performs soft archive in the current Work plan service; deletion/archive stays outside workflow V1.",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.plan.delete",
    label: "删除 OKR/工作计划",
    writeKind: "delete",
    targetKind: "WorkPlan",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/work/tasks/plans/:id/delete")],
  },
  {
    ...WORK_TASKS,
    ...OPTIONAL_APPROVAL_AUTO,
    key: "work.tasks.item.create",
    label: "创建工作节点",
    writeKind: "save",
    targetKind: "WorkItem",
    directPermissionAction: "create",
    workflowCategoryKey: "collaboration",
    settingsSortOrder: 601,
    apiRoutes: [route("POST", "/api/modules/work/tasks")],
    notes: "组织空间工作节点默认按 create 权限直接写入；管理员显式接入流程后复用同一 validator 和 commit 进入审批。",
  },
  {
    ...WORK_TASKS,
    ...OPTIONAL_APPROVAL_AUTO,
    key: "work.tasks.item.update",
    label: "更新工作节点",
    writeKind: "save",
    targetKind: "WorkItem",
    directPermissionAction: "update",
    workflowCategoryKey: "collaboration",
    settingsSortOrder: 602,
    apiRoutes: [route("PUT", "/api/modules/work/tasks/:id")],
    notes: "组织空间工作节点默认按 update 权限直接写入；管理员显式接入流程后复用同一 validator 和 commit 进入审批。",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.item.delete",
    label: "删除工作节点",
    writeKind: "delete",
    targetKind: "WorkItem",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/work/tasks/:id")],
  },
  {
    moduleKey: "work",
    resourceKey: WORK_OKR_CONTROL_CAPABILITY_KEY,
    originHrefPattern: "/work/me",
    ...PERMISSION_ONLY,
    key: "work.tasks.okr_control.save",
    label: "保存周期与流程设置",
    writeKind: "save",
    targetKind: "WorkOkrControlPolicy",
    directPermissionAction: "configure",
    apiRoutes: [route("PUT", "/api/modules/work/tasks/okr-control")],
    notes: "全局周期、流程与汇报规则配置由独立 capability 控制，不继承工作空间内的业务写权限。",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.kpi_definition.create",
    label: "创建 KPI 指标定义",
    writeKind: "create",
    targetKind: "WorkKpiDefinition",
    directPermissionAction: "update",
    apiRoutes: [route("POST", "/api/modules/work/tasks/kpi/definitions")],
    notes: "KPI 指标库由归口部门授权人员直接维护；已生效定义的修改通过 revision action 创建下一版本。",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.kpi_definition.revise",
    label: "修订 KPI 指标定义",
    writeKind: "revise",
    targetKind: "WorkKpiDefinition",
    directPermissionAction: "update",
    apiRoutes: [route("PUT", "/api/modules/work/tasks/kpi/definitions/:id")],
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.kpi_definition.delete",
    label: "删除 KPI 指标定义",
    writeKind: "delete",
    targetKind: "WorkKpiDefinition",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/work/tasks/kpi/definitions/:id")],
    notes: "仅允许删除未被周期计分卡引用的指标定义版本。",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.kpi_measurement.update",
    label: "更新 KPI 实际值",
    writeKind: "update",
    targetKind: "WorkKpiAssignment",
    directPermissionAction: "update",
    apiRoutes: [route("PUT", "/api/modules/work/tasks/plans/:id/kpi-measurements")],
    notes: "执行期实际值按计划空间 update 权限直接写入；目标确认和结果确认仍复用目标 8-flow。",
  },
  {
    ...WORK_TASKS,
    ...OPTIONAL_APPROVAL_AUTO,
    key: "work.tasks.report.save",
    label: "提交工作汇报/绩效确认",
    writeKind: "save",
    targetKind: "WorkReport",
    directPermissionAction: "update",
    workflowCategoryKey: "assessment",
    settingsVisibility: "runtime_only",
    apiRoutes: [route("PUT", "/api/modules/work/tasks/reports", "汇报审批前的本地草稿保存"), route("POST", "/api/modules/work/tasks/submissions"), route("POST", "/api/modules/work/tasks/submissions/:id/submit")],
    notes: "Legacy mixed report approval runtime key. New OKR settings use department/personal result/contribution report action keys.",
  },
  {
    ...WORK_TASKS,
    ...OPTIONAL_APPROVAL_AUTO,
    key: "work.tasks.revision.save",
    label: "提交修订/更正",
    writeKind: "save",
    targetKind: "WorkRevision",
    directPermissionAction: "update",
    workflowCategoryKey: "assessment",
    settingsVisibility: "runtime_only",
    apiRoutes: [route("POST", "/api/modules/work/tasks/submissions")],
    notes: "Legacy mixed revision runtime key. New OKR settings split objective revision and report correction for department/personal flows.",
  },
  {
    ...DOCS_EDITOR,
    ...OPTIONAL_PUBLISH_AUTO,
    key: "docs.editor.template.draft.create",
    label: "创建文档模板草稿",
    writeKind: "save",
    targetKind: "DocumentTemplate",
    directPermissionAction: "create",
    workflowCategoryKey: "document",
    apiRoutes: [route("POST", "/api/modules/docs/editor")],
    notes: "ApprovalRequest-ready. Current flowType=publish is a compatibility display value; routing type and create outcome should be split in a later model.",
  },
  {
    ...DOCS_EDITOR,
    ...OPTIONAL_PUBLISH_AUTO,
    key: "docs.editor.template.draft.save",
    label: "保存文档模板草稿",
    writeKind: "save",
    targetKind: "DocumentTemplate",
    directPermissionAction: "update",
    workflowCategoryKey: "document",
    apiRoutes: [route("PUT", "/api/modules/docs/editor/templates/:templateId")],
    notes: "Draft save uses the same configurable ApprovalRequest adapter as the editor runtime; personal space remains direct.",
  },
  {
    ...DOCS_EDITOR,
    ...OPTIONAL_PUBLISH_AUTO,
    key: "docs.editor.template.publish",
    label: "发布文档模板",
    writeKind: "approve",
    targetKind: "DocumentTemplate",
    directPermissionAction: "update",
    workflowCategoryKey: "document",
    apiRoutes: [route("POST", "/api/modules/docs/editor/templates/:templateId/publish")],
    notes: "ApprovalRequest-ready. Submit freezes the current template snapshot; approval publishes that snapshot as a permanent version.",
  },
  {
    ...DOCS_EDITOR,
    ...PERMISSION_ONLY,
    key: "docs.editor.template.copy",
    label: "复制文档模板",
    writeKind: "create",
    targetKind: "DocumentTemplate",
    directPermissionAction: "create",
    apiRoutes: [route("POST", "/api/modules/docs/editor/templates/:templateId/copy")],
  },
  {
    ...DOCS_EDITOR,
    ...PERMISSION_ONLY,
    key: "docs.editor.template.archive",
    label: "归档文档模板",
    writeKind: "archive",
    targetKind: "DocumentTemplate",
    directPermissionAction: "delete",
    apiRoutes: [route("POST", "/api/modules/docs/editor/templates/:templateId/archive")],
  },
  {
    ...DOCS_EDITOR,
    ...PERMISSION_ONLY,
    key: "docs.editor.template.draft.delete",
    label: "删除文档模板草稿",
    writeKind: "delete",
    targetKind: "DocumentTemplateDraft",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/docs/editor/templates/:templateId")],
  },
  {
    ...PRODUCTION_QC,
    ...PERMISSION_ONLY,
    key: "production.qc.batch.create",
    label: "创建 QC 批次",
    writeKind: "create",
    targetKind: "QcBatch",
    directPermissionAction: "create",
    apiRoutes: [route("POST", "/api/modules/production/qc")],
    notes: "QC has native in-place review UI. WorkflowPolicy does not control batch creation until a QC workflow adapter lands.",
  },
  {
    ...PRODUCTION_QC,
    ...REQUIRED_REVIEW_INDEPENDENT,
    key: "production.qc.batch.precheck.save",
    label: "保存 QC 预检记录",
    writeKind: "save",
    targetKind: "QcBatchPrecheck",
    directPermissionAction: "update",
    workflowCategoryKey: "quality",
    apiRoutes: [route("PATCH", "/api/modules/production/qc/:batchId", "Distinguished by body.action=save_precheck.")],
    notes: "QC precheck save participates in native in-place review; it does not create ApprovalRequest rows or appear in the generic workflow ledger.",
  },
  {
    ...PRODUCTION_QC,
    ...REQUIRED_REVIEW_INDEPENDENT,
    key: "production.qc.batch.inspection.save",
    label: "保存 QC 检验记录",
    writeKind: "save",
    targetKind: "QcBatchInspection",
    directPermissionAction: "update",
    workflowCategoryKey: "quality",
    apiRoutes: [route("PATCH", "/api/modules/production/qc/:batchId", "Distinguished by body.action=save_inspection.")],
    notes: "QC inspection save participates in native in-place review; it does not create ApprovalRequest rows or appear in the generic workflow ledger.",
  },
  {
    ...PRODUCTION_QC,
    ...PERMISSION_ONLY,
    key: "production.qc.batch.review",
    label: "QC 批次复核",
    writeKind: "approve",
    targetKind: "QcBatchReview",
    directPermissionAction: "approve",
    apiRoutes: [route("POST", "/api/modules/production/qc/:batchId/approve-review")],
    notes: "QC review is the processing action for native QC save flows; it is not a workflow request entry.",
  },
  {
    ...PRODUCTION_QC,
    ...PERMISSION_ONLY,
    key: "production.qc.batch.delete",
    label: "删除 QC 批次",
    writeKind: "delete",
    targetKind: "QcBatch",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/production/qc/:batchId")],
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.employee.create",
    label: "创建员工档案",
    writeKind: "create",
    targetKind: "Employee",
    directPermissionAction: "create",
    apiRoutes: [route("POST", "/api/modules/hr/roster/employees")],
    notes: "Registered for business-action visibility. No HR employee approval adapter is wired yet, so this stays permission-only until submit/approve UI and route guard land.",
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.employee.update",
    label: "保存员工信息表",
    writeKind: "update",
    targetKind: "Employee",
    directPermissionAction: "update",
    apiRoutes: [route("PUT", "/api/modules/hr/roster/employees")],
    notes: "Employee table edits are submitted as one page-level change set. The action remains permission-only until the HR approval adapter and inline status UI land.",
  },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employeeProfile.contracts.save", label: "保存员工详情合同", writeKind: "save", targetKind: "EmployeeProfileContractRows", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/employee-profiles/:id/contracts")], notes: "Registered for business-action visibility. Current API remains direct write until HR profile workflow adapter lands." },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employeeProfile.edps.save", label: "保存员工详情部门岗位", writeKind: "save", targetKind: "EmployeeProfileDepartmentPositionRows", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/employee-profiles/:id/edps")], notes: "Registered for business-action visibility. This form should be promoted to workflow only together with inline status UI and route guard." },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employeeProfile.lifecycle.record", label: "登记员工生命周期变更", writeKind: "save", targetKind: "EmployeeLifecycleEvent", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/employee-profiles/:id/lifecycle")], notes: "One effective-dated command atomically updates Employment/EDP periods and appends the immutable lifecycle event ledger." },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.employee.delete",
    label: "删除员工档案",
    writeKind: "delete",
    targetKind: "Employee",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/hr/roster/employees/:id")],
  },
  {
    ...HR_ROSTER,
    ...OPTIONAL_APPROVAL_AUTO,
    key: "hr.roster.department.create",
    label: "创建部门",
    writeKind: "save",
    targetKind: "Department",
    directPermissionAction: "create",
    workflowCategoryKey: "hr",
    apiRoutes: [route("POST", "/api/modules/hr/roster/departments")],
  },
  {
    ...HR_ROSTER,
    ...OPTIONAL_APPROVAL_AUTO,
    key: "hr.roster.department.update",
    label: "更新部门",
    writeKind: "save",
    targetKind: "Department",
    directPermissionAction: "update",
    workflowCategoryKey: "hr",
    apiRoutes: [route("PUT", "/api/modules/hr/roster/departments"), route("PUT", "/api/modules/hr/roster/departments/:id")],
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.department.archive",
    label: "归档部门",
    writeKind: "archive",
    targetKind: "Department",
    directPermissionAction: "archive",
    apiRoutes: [route("POST", "/api/modules/hr/roster/departments/:id/archive")],
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.department.delete",
    label: "删除部门",
    writeKind: "delete",
    targetKind: "Department",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/hr/roster/departments"), route("DELETE", "/api/modules/hr/roster/departments/:id")],
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.position.create",
    label: "创建岗位",
    writeKind: "create",
    targetKind: "Position",
    directPermissionAction: "create",
    apiRoutes: [route("POST", "/api/modules/hr/roster/positions")],
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.position.update",
    label: "更新岗位",
    writeKind: "update",
    targetKind: "Position",
    directPermissionAction: "update",
    apiRoutes: [route("PUT", "/api/modules/hr/roster/positions/:id"), route("PUT", "/api/modules/hr/roster/positions")],
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.position.archive",
    label: "归档岗位",
    writeKind: "archive",
    targetKind: "Position",
    directPermissionAction: "archive",
    apiRoutes: [route("POST", "/api/modules/hr/roster/positions/:id/archive")],
  },
  {
    ...HR_ROSTER,
    ...PERMISSION_ONLY,
    key: "hr.roster.position.delete",
    label: "删除岗位",
    writeKind: "delete",
    targetKind: "Position",
    directPermissionAction: "delete",
    apiRoutes: [route("DELETE", "/api/modules/hr/roster/positions/:id"), route("DELETE", "/api/modules/hr/roster/positions")],
  },
  {
    moduleKey: "hr",
    resourceKey: "hr.roster.generated",
    originHrefPattern: "/hr/roster",
    ...PERMISSION_ONLY,
    key: "hr.roster.generated.export",
    label: "导出花名册生成资料",
    writeKind: "export",
    targetKind: "HrRosterGeneratedExport",
    directPermissionAction: "export",
    apiRoutes: [route("GET", "/api/modules/hr/roster/generated/export", "GET export is permission-only; it is not a write route candidate.")],
  },
  ...ADDITIONAL_BUSINESS_ACTION_REGISTRATIONS,
] as const satisfies readonly BusinessActionRegistration[];

const REGISTRATION_BY_KEY = new Map<string, BusinessActionRegistration>(
  BUSINESS_ACTION_REGISTRATIONS.map((registration) => [registration.key, registration]),
);

assertBusinessActionRegistryValid(BUSINESS_ACTION_REGISTRATIONS);

export type BusinessActionKey = (typeof BUSINESS_ACTION_REGISTRATIONS)[number]["key"];

export function listBusinessActionRegistrations(): readonly BusinessActionRegistration[] { return BUSINESS_ACTION_REGISTRATIONS; }

export function getBusinessActionRegistration(key: string): BusinessActionRegistration | null { return REGISTRATION_BY_KEY.get(key) ?? null; }

export function listWorkflowEligibleBusinessActions(): readonly BusinessActionRegistration[] { return (BUSINESS_ACTION_REGISTRATIONS as readonly BusinessActionRegistration[]).filter((registration) => registration.eligibility === "workflow_optional" || registration.eligibility === "workflow_required"); }
