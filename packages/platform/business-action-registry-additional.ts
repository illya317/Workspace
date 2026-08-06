import type { ApiMethod } from "./api-contract-types";
import { AGENT_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-agent";
import { OPERATIONAL_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-operational";
import { WORK_GOAL_ACTION_DESCRIPTORS } from "./work-goal-action-descriptors";
import { INVENTORY_RECEIPT_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-inventory-receipts";
import { PRODUCTION_PRODUCTS_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-production-products";
import { SETTINGS_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-settings";
import { FINANCE_OPERATIONS_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-finance-operations";
import { WORK_PROJECT_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-registry-work-projects";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;
const OPTIONAL_APPROVAL_AUTO = {
  eligibility: "workflow_optional",
  flowType: "approval",
  separationPolicy: "auto_pass_if_authorized",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;
const ASSESSMENT_WORKFLOW = { workflowCategoryKey: "assessment" } as const;

const LIBRARY_BASIC_INFO = {
  moduleKey: "library",
  resourceKey: "library.basicInfo",
  originHrefPattern: "/library/basic-info",
} as const;

const NEWS = {
  moduleKey: "news",
  resourceKey: "news",
  originHrefPattern: "/news",
} as const;

const FINANCE_LEDGER = {
  moduleKey: "finance",
  resourceKey: "finance.ledger",
  originHrefPattern: "/finance/ledger",
} as const;

const FINANCE_STATEMENTS = {
  moduleKey: "finance",
  resourceKey: "finance.statements",
  originHrefPattern: "/finance/statements",
} as const;

const FINANCE_BUDGET = {
  moduleKey: "finance",
  resourceKey: "finance.budget",
  originHrefPattern: "/finance/budget",
} as const;

const FINANCE_COST = {
  moduleKey: "finance",
  resourceKey: "finance.cost",
  originHrefPattern: "/finance/cost",
} as const;

const INVENTORY_OPERATIONS = {
  moduleKey: "inventory",
  resourceKey: "inventory.operations",
  originHrefPattern: "/inventory/operations",
} as const;

const HR_PERFORMANCE = {
  moduleKey: "hr",
  resourceKey: "hr.performance",
  originHrefPattern: "/work/performance",
} as const;

const CAPITAL_SECURITIES_GOVERNANCE = {
  moduleKey: "capitalSecurities",
  resourceKey: "capitalSecurities.governance",
  originHrefPattern: "/capital-securities/governance",
} as const;

const CAPITAL_SECURITIES_INVESTORS = {
  moduleKey: "capitalSecurities",
  resourceKey: "capitalSecurities.investors",
  originHrefPattern: "/capital-securities/investors",
} as const;

const CAPITAL_SECURITIES_INVESTMENTS = {
  moduleKey: "capitalSecurities",
  resourceKey: "capitalSecurities.investments",
  originHrefPattern: "/capital-securities/investments",
} as const;

const STANDARD_SPACE_SCOPES = ["personal", "department", "committee", "company"] as const;

const WORK_TASKS = {
  moduleKey: "work",
  resourceKey: "work.tasks",
  scopeTypes: STANDARD_SPACE_SCOPES,
  originHrefPattern: "/work/me",
} as const;

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

const WORK_OKR_WORKFLOW_ACTIONS = WORK_GOAL_ACTION_DESCRIPTORS.map((descriptor) => ({
  ...WORK_TASKS,
  ...OPTIONAL_APPROVAL_AUTO,
  ...ASSESSMENT_WORKFLOW,
  ...descriptor,
  directPermissionAction: "update" as const,
}));

export const ADDITIONAL_BUSINESS_ACTION_REGISTRATIONS = [
  ...PRODUCTION_PRODUCTS_BUSINESS_ACTION_REGISTRATIONS,
  ...INVENTORY_RECEIPT_BUSINESS_ACTION_REGISTRATIONS,
  ...OPERATIONAL_BUSINESS_ACTION_REGISTRATIONS,
  ...AGENT_BUSINESS_ACTION_REGISTRATIONS,
  ...SETTINGS_BUSINESS_ACTION_REGISTRATIONS,
  ...FINANCE_OPERATIONS_BUSINESS_ACTION_REGISTRATIONS,
  ...WORK_PROJECT_BUSINESS_ACTION_REGISTRATIONS,
  {
    ...HR_PERFORMANCE,
    eligibility: "workflow_optional",
    flowType: "approval",
    separationPolicy: "auto_pass_if_authorized",
    submitPermissionAction: "submit",
    processPermissionAction: "approve",
    workflowCategoryKey: "assessment",
    key: "hr.performance.review.evaluate",
    label: "发起绩效评审",
    writeKind: "submit",
    targetKind: "HrPerformanceReview",
    apiRoutes: [
      route("POST", "/api/modules/hr/performance/submissions"),
      route("PUT", "/api/modules/hr/performance/submissions/:id"),
      route("POST", "/api/modules/hr/performance/submissions/:id/submit"),
      route("POST", "/api/modules/hr/performance/submissions/:id/approve"),
      route("POST", "/api/modules/hr/performance/submissions/:id/reject"),
    ],
    notes: "员工自评、直属上级评分、HR 最终评分共用 ApprovalRequest，最终通过时写入 HR-owned HrPerformanceReview。",
  },
  ...WORK_OKR_WORKFLOW_ACTIONS,
  {
    ...WORK_TASKS,
    eligibility: "workflow_optional",
    flowType: "approval",
    separationPolicy: "auto_pass_if_authorized",
    directPermissionAction: "update",
    submitPermissionAction: "submit",
    processPermissionAction: "approve",
    workflowCategoryKey: "collaboration",
    key: "work.tasks.collaboration.submit",
    label: "提交部门协作",
    writeKind: "submit",
    targetKind: "DepartmentCollaboration",
    settingsSortOrder: 501,
    apiRoutes: [
      route("POST", "/api/modules/work/tasks/collaborations"),
      route("PUT", "/api/modules/work/tasks/collaborations/:id"),
    ],
    notes: "默认零审批节点，提交后立即写入；管理员可配置审批节点或关闭流程后按 update 权限直接写入。",
  },
  {
    ...WORK_TASKS,
    ...PERMISSION_ONLY,
    key: "work.tasks.collaboration.respond",
    label: "响应部门协作",
    writeKind: "update",
    targetKind: "DepartmentCollaborationDepartment",
    directPermissionAction: "update",
    apiRoutes: [route("POST", "/api/modules/work/tasks/collaborations/:id/respond")],
    notes: "赋能部门接受或拒绝固定协作通道；响应事实由 DepartmentCollaborationDepartment 保存。",
  },
  {
    ...WORK_TASKS,
    ...OPTIONAL_APPROVAL_AUTO,
    ...ASSESSMENT_WORKFLOW,
    key: "work.tasks.objective_plan.save",
    label: "提交目标审查",
    writeKind: "save",
    targetKind: "WorkPlan",
    directPermissionAction: "update",
    settingsVisibility: "runtime_only",
    apiRoutes: [
      route("POST", "/api/modules/work/tasks/submissions"),
      route("POST", "/api/modules/work/tasks/submissions/:id/submit"),
    ],
    notes: "Legacy mixed objective approval runtime key. New target settings use department/personal objective submit action keys.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.directory.create",
    label: "新建资料文件夹",
    writeKind: "create",
    targetKind: "LibraryDirectory",
    directPermissionAction: "configure",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/directories")],
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.directory.rename",
    label: "重命名资料文件夹",
    writeKind: "revise",
    targetKind: "LibraryDirectory",
    directPermissionAction: "configure",
    apiRoutes: [route("PATCH", "/api/modules/library/basic-info/directories")],
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.directory.delete",
    label: "删除资料文件夹",
    writeKind: "delete",
    targetKind: "LibraryDirectory",
    directPermissionAction: "configure",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/directories/delete")],
    notes: "Only an empty leaf logical directory can be deleted.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.document.import",
    label: "上传资料入库",
    writeKind: "import",
    targetKind: "LibraryDocument",
    directPermissionAction: "import",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/documents")],
    notes: "Creates a pending LibraryDocument and immutable V1, then runs the existing Markdown and PDF preview processors before human review.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.document.review",
    label: "确认资料入库",
    writeKind: "approve",
    targetKind: "LibraryDocumentReview",
    directPermissionAction: "import",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/documents/:id/review")],
    notes: "The importer explicitly confirms metadata, folder and tags after derived artifacts have been attempted.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.document.metadata.save",
    label: "保存资料元数据",
    writeKind: "save",
    targetKind: "LibraryDocumentMetadata",
    directPermissionAction: "update",
    apiRoutes: [route("PATCH", "/api/modules/library/basic-info/documents/:id", "Ordinary title/summary/tag/folder metadata fields require update.")],
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.document.archive",
    label: "归档资料文件",
    writeKind: "archive",
    targetKind: "LibraryDocument",
    directPermissionAction: "archive",
    apiRoutes: [route("DELETE", "/api/modules/library/basic-info/documents/:id")],
    notes: "The lifecycle command owns archive/restore state transitions; metadata PATCH cannot write status.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.document.delete",
    label: "永久删除资料文件",
    writeKind: "delete",
    targetKind: "LibraryDocument",
    directPermissionAction: "configure",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/documents/:id/delete")],
    notes: "Permanent deletion is separate from archive, rejects evaluation-evidence references, and removes only document-owned runtime storage.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.document.confidentiality.configure",
    label: "调整资料保密等级",
    writeKind: "save",
    targetKind: "LibraryDocumentConfidentiality",
    directPermissionAction: "configure",
    apiRoutes: [route("PATCH", "/api/modules/library/basic-info/documents/:id", "confidentialityLevel changes require configure.")],
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.scan.import",
    label: "扫描资料入库",
    writeKind: "import",
    targetKind: "LibraryDocumentScan",
    directPermissionAction: "import",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/scan")],
    notes: "Scan reconciles files into LibraryDocument rows and versions; no page button is exposed in the current UI.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.generatedDocument.import",
    label: "生成资料入库",
    writeKind: "import",
    targetKind: "GeneratedLibraryDocument",
    directPermissionAction: "import",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/generated-sources/:key/generate")],
    notes: "Generated documents use the source default confidentiality level; overriding it is a field-level configure action checked by the library command builder.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.documentVersion.import",
    label: "上传资料新版本",
    writeKind: "import",
    targetKind: "LibraryDocumentVersion",
    directPermissionAction: "import",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/documents/:id/versions")],
    notes: "Each upload creates a new immutable binary version; metadata-only edits do not use this action.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.documentSet.export",
    label: "生成资料集合包",
    writeKind: "export",
    targetKind: "LibraryExportJob",
    directPermissionAction: "export",
    apiRoutes: [route("POST", "/api/modules/library/basic-info/exports")],
    notes: "Selection is frozen to immutable versionUid values and permission/confidentiality are checked at creation, worker execution and download.",
  },
  {
    ...LIBRARY_BASIC_INFO,
    ...PERMISSION_ONLY,
    key: "library.basicInfo.document.export",
    label: "下载资料文件",
    writeKind: "export",
    targetKind: "LibraryDocumentFile",
    directPermissionAction: "export",
    apiRoutes: [
      route("GET", "/api/modules/library/basic-info/documents/:id/download"),
      route("GET", "/api/modules/library/basic-info/documents/:id/versions/:versionId/download"),
      route("GET", "/api/modules/library/basic-info/:*"),
    ],
    notes: "GET export/download routes are permission-only and stay outside write workflow.",
  },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.account.create", label: "创建会计科目", writeKind: "create", targetKind: "FinanceAccount", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/ledger/accounts")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.account.update", label: "更新会计科目", writeKind: "update", targetKind: "FinanceAccount", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/ledger/accounts/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.account.delete", label: "删除会计科目", writeKind: "delete", targetKind: "FinanceAccount", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/ledger/accounts/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.voucher.create", label: "创建凭证", writeKind: "create", targetKind: "FinanceVoucher", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/ledger/vouchers")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.voucher.update", label: "更新凭证", writeKind: "update", targetKind: "FinanceVoucher", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/ledger/vouchers/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.voucher.delete", label: "删除凭证", writeKind: "delete", targetKind: "FinanceVoucher", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/ledger/vouchers/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.period.create", label: "创建会计期间", writeKind: "create", targetKind: "FinancePeriod", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/ledger/periods")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.period.update", label: "更新会计期间", writeKind: "update", targetKind: "FinancePeriod", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/ledger/periods/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.period.delete", label: "删除会计期间", writeKind: "delete", targetKind: "FinancePeriod", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/ledger/periods/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.defaultBook.create", label: "初始化默认账套", writeKind: "create", targetKind: "FinanceLedgerDefaultBook", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/ledger/init")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.balance.revise", label: "重算科目余额", writeKind: "update", targetKind: "FinanceAccountBalance", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/finance/ledger/balances")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.workspace.export", label: "下载总账 Excel", writeKind: "export", targetKind: "FinanceLedgerWorkbook", directPermissionAction: "export", apiRoutes: [route("GET", "/api/modules/finance/ledger/export", "GET export is permission-only and generates no business record.")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.groupAccount.create", label: "新增集团科目", writeKind: "create", targetKind: "FinanceGroupAccount", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/finance/ledger/group-accounts")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.groupAccount.update", label: "编辑集团科目", writeKind: "update", targetKind: "FinanceGroupAccount", directPermissionAction: "revise", apiRoutes: [route("PUT", "/api/modules/finance/ledger/group-accounts/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.groupAccount.delete", label: "删除集团科目", writeKind: "delete", targetKind: "FinanceGroupAccount", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/ledger/group-accounts/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.groupAccount.review", label: "复核集团科目", writeKind: "approve", targetKind: "FinanceGroupAccount", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/finance/ledger/group-accounts/:id/review")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.groupAccountMapping.save", label: "保存集团科目映射", writeKind: "save", targetKind: "FinanceGroupAccountMapping", directPermissionAction: "revise", apiRoutes: [route("PUT", "/api/modules/finance/ledger/group-accounts")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.reclassRule.save", label: "保存重分类规则", writeKind: "save", targetKind: "FinanceReclassRule", directPermissionAction: "revise", apiRoutes: [route("PUT", "/api/modules/finance/ledger/reclass-rules")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.reclassAdjustment.save", label: "保存重分类调整", writeKind: "save", targetKind: "FinanceBalanceReclassAdjustment", directPermissionAction: "revise", apiRoutes: [route("PUT", "/api/modules/finance/ledger/reclass-adjustments")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.reclassResult.generate", label: "生成重分类结果", writeKind: "update", targetKind: "ReclassResult", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/finance/ledger/reclass-results")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.reclassResult.adjust", label: "调整重分类结果", writeKind: "update", targetKind: "ReclassResult", directPermissionAction: "revise", apiRoutes: [route("PATCH", "/api/modules/finance/ledger/reclass-results/:id")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.close.open", label: "开启关账工作台", writeKind: "create", targetKind: "FinanceCloseRun", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/ledger/closing")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.close.refresh", label: "刷新关账工作台", writeKind: "update", targetKind: "FinanceCloseRun", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/finance/ledger/closing/refresh")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.close.complete", label: "完成会计期间关账", writeKind: "approve", targetKind: "FinanceCloseRun", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/finance/ledger/closing/complete")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.close.workpaper.save", label: "保存关账底稿", writeKind: "update", targetKind: "FinanceCloseWorkpaper", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/ledger/closing/workpapers")] },
  { ...FINANCE_LEDGER, ...PERMISSION_ONLY, key: "finance.ledger.close.workpaper.review", label: "复核关账底稿", writeKind: "approve", targetKind: "FinanceCloseWorkpaper", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/finance/ledger/closing/workpapers/review")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.report.export", label: "下载财务三表", writeKind: "export", targetKind: "FinanceStatementWorkbook", directPermissionAction: "export", apiRoutes: [route("GET", "/api/modules/finance/statements/reports/export", "GET export is permission-only and generates no business record."), route("GET", "/api/modules/finance/statements/consolidation/batches/:batchId/report/export", "GET export is permission-only and generates no business record.")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.exchangeRate.save", label: "刷新报表汇率", writeKind: "update", targetKind: "FinanceStatementExchangeRate", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/exchange-rates")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationScope.save", label: "选择本次合并报表主体", writeKind: "save", targetKind: "FinanceConsolidationScopeSelection", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/statements/consolidation/scope-selections")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationBatch.ensure", label: "创建合并批次", writeKind: "create", targetKind: "FinanceConsolidationBatch", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationBatch.delete", label: "删除合并批次草稿", writeKind: "delete", targetKind: "FinanceConsolidationBatch", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/statements/consolidation/batches/:batchId")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationSources.save", label: "自动准备合并来源与汇率", writeKind: "save", targetKind: "FinanceConsolidationSourceSnapshot", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/statements/consolidation/batches/:batchId/sources")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationControl.resolve", label: "记录合并控制结论", writeKind: "save", targetKind: "FinanceConsolidationControlDecision", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/statements/consolidation/batches/:batchId/control-decisions")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationEntry.save", label: "编制合并抵销分录", writeKind: "save", targetKind: "FinanceConsolidationEntry", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/entries"), route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/entries/generate")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationEntry.approve", label: "通过合并抵销分录", writeKind: "approve", targetKind: "FinanceConsolidationEntry", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/entries/:entryId/approve")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationEntry.return", label: "退回合并抵销分录", writeKind: "reject", targetKind: "FinanceConsolidationEntry", directPermissionAction: "reject", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/entries/:entryId/return")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationEntry.delete", label: "删除合并抵销分录草稿", writeKind: "delete", targetKind: "FinanceConsolidationEntry", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/statements/consolidation/batches/:batchId/entries/:entryId")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationTaxEffect.save", label: "记录抵销税务影响", writeKind: "save", targetKind: "FinanceConsolidationTaxEffect", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/statements/consolidation/batches/:batchId/entries/:entryId/tax-effects")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationTaxEffect.delete", label: "删除抵销税务影响草稿", writeKind: "delete", targetKind: "FinanceConsolidationTaxEffect", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/statements/consolidation/batches/:batchId/entries/:entryId/tax-effects/:taxEffectId")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationBatch.submit", label: "提交合并批次", writeKind: "submit", targetKind: "FinanceConsolidationBatch", directPermissionAction: "submit", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/submit")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationBatch.return", label: "退回合并批次", writeKind: "reject", targetKind: "FinanceConsolidationBatch", directPermissionAction: "reject", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/return")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationBatch.review", label: "独立复核合并批次", writeKind: "approve", targetKind: "FinanceConsolidationBatch", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/review")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationBatch.lock", label: "锁定合并批次", writeKind: "approve", targetKind: "FinanceConsolidationBatch", directPermissionAction: "lock", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/lock")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.consolidationBatch.publish", label: "发布合并报表", writeKind: "approve", targetKind: "FinanceConsolidationBatch", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/finance/statements/consolidation/batches/:batchId/publish")] },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.comparison.import", label: "上传报表对比证据", writeKind: "import", targetKind: "FinanceStatementComparisonPackage", directPermissionAction: "import", apiRoutes: [route("POST", "/api/modules/finance/statements/comparisons")], notes: "Upload persists an immutable comparison evidence package only; the API gateway additionally requires create alongside import, and no accounting fact is created or updated." },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.comparisonMapping.save", label: "确认报表对比映射", writeKind: "save", targetKind: "FinanceStatementComparisonMapping", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/statements/comparisons/:id/mapping")], notes: "Confirm or remap with (mappingId, expectedRevision) CAS; ambiguous or duplicate line mappings must be resolved by the user first." },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.comparisonRun.create", label: "生成报表对比运行", writeKind: "create", targetKind: "FinanceStatementComparisonRun", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/statements/comparisons/:id/runs")], notes: "Each run is an immutable append-only audit snapshot; a rerun creates a new run and never edits an old one." },
  { ...FINANCE_STATEMENTS, ...PERMISSION_ONLY, key: "finance.statements.comparison.archive", label: "归档报表对比证据", writeKind: "archive", targetKind: "FinanceStatementComparisonPackage", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/finance/statements/comparisons/:id/archive")], notes: "Archive instead of delete; evidence referenced by completed runs stays immutable and readable." },
  { ...FINANCE_BUDGET, ...PERMISSION_ONLY, key: "finance.budget.version.create", label: "创建预算版本", writeKind: "create", targetKind: "BudgetVersion", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/budget/versions")] },
  { ...FINANCE_BUDGET, ...PERMISSION_ONLY, key: "finance.budget.version.activate", label: "启用预算版本", writeKind: "approve", targetKind: "BudgetVersion", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/finance/budget/versions/:id/activate")] },
  { ...FINANCE_COST, ...PERMISSION_ONLY, key: "finance.cost.import.delete", label: "删除成本导入批次", writeKind: "delete", targetKind: "FinanceCostImport", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/finance/cost/imports/:id")] },
  { ...INVENTORY_OPERATIONS, ...PERMISSION_ONLY, key: "inventory.operations.document.create", label: "创建存货单据", writeKind: "create", targetKind: "InventoryDocument", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/inventory/operations/documents")] },
  { ...INVENTORY_OPERATIONS, ...PERMISSION_ONLY, key: "inventory.operations.document.post", label: "过账存货单据", writeKind: "update", targetKind: "InventoryDocument", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/inventory/operations/documents/:id/post")] },
  { ...INVENTORY_OPERATIONS, ...PERMISSION_ONLY, key: "inventory.operations.document.reverse", label: "冲销存货单据", writeKind: "reverse", targetKind: "InventoryDocument", directPermissionAction: "reverse", apiRoutes: [route("POST", "/api/modules/inventory/operations/documents/:id/reverse")] },
  { ...INVENTORY_OPERATIONS, ...PERMISSION_ONLY, key: "inventory.operations.closing.linkVoucher", label: "关联存货结转凭证", writeKind: "update", targetKind: "InventoryPeriodClose", directPermissionAction: "lock", apiRoutes: [route("POST", "/api/modules/inventory/operations/closing/link-voucher")] },
  {
    ...CAPITAL_SECURITIES_GOVERNANCE,
    ...PERMISSION_ONLY,
    key: "capitalSecurities.governance.organization.create",
    label: "新建治理组织",
    writeKind: "create",
    targetKind: "GovernanceOrganization",
    directPermissionAction: "create",
    apiRoutes: [route("POST", "/api/modules/capitalSecurities/governance/organizations")],
    notes: "Governance organization writes are in-place G-line Department mutations; no workflow adapter is wired.",
  },
  {
    ...CAPITAL_SECURITIES_GOVERNANCE,
    ...PERMISSION_ONLY,
    key: "capitalSecurities.governance.organization.save",
    label: "保存治理组织",
    writeKind: "save",
    targetKind: "GovernanceOrganization",
    directPermissionAction: "update",
    apiRoutes: [route("PUT", "/api/modules/capitalSecurities/governance/organizations")],
    notes: "Governance organization edits are direct saves on the selected organization detail panel.",
  },
  { ...CAPITAL_SECURITIES_GOVERNANCE, ...PERMISSION_ONLY, key: "capitalSecurities.governance.company.create", label: "新建公司", writeKind: "create", targetKind: "Company", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/capitalSecurities/governance/companies")] },
  { ...CAPITAL_SECURITIES_GOVERNANCE, ...PERMISSION_ONLY, key: "capitalSecurities.governance.company.update", label: "更新公司", writeKind: "update", targetKind: "Company", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/capitalSecurities/governance/companies")] },
  { ...CAPITAL_SECURITIES_GOVERNANCE, ...PERMISSION_ONLY, key: "capitalSecurities.governance.ownershipProjection.rebuild", label: "重建股权投影", writeKind: "update", targetKind: "OwnershipInterest", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/capitalSecurities/governance/ownership-projections/rebuild")] },
  { ...CAPITAL_SECURITIES_INVESTORS, ...PERMISSION_ONLY, key: "capitalSecurities.investors.shareholderProfile.update", label: "保存股东关系资料", writeKind: "update", targetKind: "InvestorShareholderProfile", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/capitalSecurities/investors/shareholder-profiles")] },
  { ...CAPITAL_SECURITIES_INVESTORS, ...PERMISSION_ONLY, key: "capitalSecurities.investors.dueDiligence.create", label: "新增投资人尽调记录", writeKind: "create", targetKind: "InvestorDueDiligenceRecord", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/capitalSecurities/investors/due-diligence")] },
  { ...CAPITAL_SECURITIES_INVESTORS, ...PERMISSION_ONLY, key: "capitalSecurities.investors.dueDiligence.update", label: "更新投资人尽调记录", writeKind: "update", targetKind: "InvestorDueDiligenceRecord", directPermissionAction: "update", apiRoutes: [route("PATCH", "/api/modules/capitalSecurities/investors/due-diligence/:id")] },
  { ...CAPITAL_SECURITIES_INVESTORS, ...PERMISSION_ONLY, key: "capitalSecurities.investors.dueDiligence.archive", label: "移除投资人尽调记录", writeKind: "delete", targetKind: "InvestorDueDiligenceRecord", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/capitalSecurities/investors/due-diligence/:id")] },
  { ...CAPITAL_SECURITIES_INVESTMENTS, ...PERMISSION_ONLY, key: "capitalSecurities.investments.profile.create", label: "新建投资企业档案", writeKind: "create", targetKind: "InvestmentEnterpriseProfile", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/capitalSecurities/investments")] },
  { ...CAPITAL_SECURITIES_INVESTMENTS, ...PERMISSION_ONLY, key: "capitalSecurities.investments.profile.update", label: "更新投资企业档案", writeKind: "update", targetKind: "InvestmentEnterpriseProfile", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/capitalSecurities/investments")] },
  { ...CAPITAL_SECURITIES_INVESTMENTS, ...PERMISSION_ONLY, key: "capitalSecurities.investments.record.create", label: "新增投资企业业务记录", writeKind: "create", targetKind: "InvestmentEnterpriseRecord", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/capitalSecurities/investments/records")], notes: "The validated kind discriminant selects meeting, diligence, contract, or monitoring persistence." },
  { ...CAPITAL_SECURITIES_INVESTMENTS, ...PERMISSION_ONLY, key: "capitalSecurities.investments.record.update", label: "更新投资企业业务记录", writeKind: "update", targetKind: "InvestmentEnterpriseRecord", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/capitalSecurities/investments/records")], notes: "The validated kind discriminant and optimistic version select the exact record table." },
  { ...CAPITAL_SECURITIES_INVESTMENTS, ...PERMISSION_ONLY, key: "capitalSecurities.investments.document.import", label: "上传并分析投资企业资料", writeKind: "import", targetKind: "InvestmentEnterpriseDocumentLink", directPermissionAction: "import", apiRoutes: [route("POST", "/api/modules/capitalSecurities/investments/documents")], notes: "Capital stores the stable document link while the Library owner creates immutable versions, OCR chunks, and vector indexes." },
  { ...NEWS, ...PERMISSION_ONLY, key: "news.reaction.save", label: "保存资讯偏好", writeKind: "update", targetKind: "NewsReaction", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/news/reactions")] },
] as const;
