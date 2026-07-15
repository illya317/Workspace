import { defineActionContractMetadataList } from "./action-contract";
import { ADMINISTRATION_ACTION_CONTRACT_METADATA } from "./action-contract-registry-administration";
import { EXTERNAL_ACTION_CONTRACT_METADATA } from "./action-contract-registry-external";
import { HR_DIRECT_ACTION_CONTRACT_METADATA } from "./action-contract-registry-hr-direct";
import { SMALL_MODULE_ACTION_CONTRACT_METADATA } from "./action-contract-registry-small-modules";
import { WORK_DIRECT_ACTION_CONTRACT_METADATA } from "./action-contract-registry-work-direct";
import { FINANCE_DIRECT_ACTION_CONTRACT_METADATA } from "./action-contract-registry-finance-direct";
import { WORK_GOAL_ACTION_CONTRACTS } from "./action-contract-registry-work-goal";
import { PRODUCTION_QC_ACTION_CONTRACT_METADATA } from "./action-contract-registry-production-qc";

const HR_PERFORMANCE_WORKFLOW_RESOURCE = {
  resourceKey: "hr.performance",
  moduleKey: "hr",
  scopeTypes: ["global"],
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const HR_PERFORMANCE_WORKFLOW_MUTATION = {
  handlerCanRevise: true,
  requestCanWithdraw: true,
  requestCanRevise: true,
  requestCanCancel: true,
  requestCanResubmit: true,
} as const;

const HR_PERFORMANCE_WORKFLOW_CONFIGURATION = {
  nodeKinds: ["approval"],
  assigneeKinds: ["permission_holders", "direct_manager", "position", "employee"],
  approvalModes: ["any_one", "all"],
  separationPolicies: ["auto_pass_if_authorized", "independent_required"],
  allowNodeAddRemove: true,
  allowBypassConditions: true,
  maxNodes: 8,
} as const;

const HR_ROSTER_WORKFLOW_UPDATE_RESOURCE = {
  resourceKey: "hr.roster",
  moduleKey: "hr",
  scopeTypes: ["global"],
  directPermissionAction: "update",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const HR_ROSTER_WORKFLOW_MUTATION = {
  handlerCanRevise: true,
  requestCanWithdraw: true,
  requestCanRevise: true,
  requestCanCancel: true,
  requestCanResubmit: true,
} as const;

const HR_ROSTER_WORKFLOW_CONFIGURATION = {
  nodeKinds: ["approval"],
  assigneeKinds: ["permission_holders", "direct_manager", "department_owner", "position", "employee"],
  approvalModes: ["any_one", "all"],
  separationPolicies: ["auto_pass_if_authorized", "independent_required"],
  allowNodeAddRemove: true,
  allowBypassConditions: true,
  maxNodes: 8,
} as const;

const WORK_TASKS_RESOURCE = {
  resourceKey: "work.tasks",
  moduleKey: "work",
  scopeTypes: ["personal", "company", "committee", "department"],
  directPermissionAction: "update",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const WORK_TASKS_ITEM_CREATE_RESOURCE = {
  ...WORK_TASKS_RESOURCE,
  directPermissionAction: "create",
} as const;

const WORK_TASKS_ITEM_UPDATE_RESOURCE = {
  ...WORK_TASKS_RESOURCE,
  directPermissionAction: "update",
} as const;

const WORK_TASKS_REPORT_SAVE_RESOURCE = {
  ...WORK_TASKS_RESOURCE,
  directPermissionAction: "update",
} as const;

const WORK_TASKS_REVISION_SAVE_RESOURCE = {
  ...WORK_TASKS_RESOURCE,
  directPermissionAction: "update",
} as const;

const WORK_TASKS_WORKFLOW_MUTATION = {
  handlerCanRevise: true,
  requestCanWithdraw: true,
  requestCanRevise: true,
  requestCanCancel: true,
  requestCanResubmit: true,
} as const;

const WORK_TASKS_WORKFLOW_CONFIGURATION = {
  nodeKinds: ["approval"],
  assigneeKinds: ["permission_holders", "direct_manager", "department_owner", "position", "employee"],
  approvalModes: ["any_one", "all"],
  separationPolicies: ["auto_pass_if_authorized", "independent_required"],
  allowNodeAddRemove: true,
  allowBypassConditions: true,
  maxNodes: 8,
} as const;

export const ADDITIONAL_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  ...ADMINISTRATION_ACTION_CONTRACT_METADATA,
  ...EXTERNAL_ACTION_CONTRACT_METADATA,
  ...HR_DIRECT_ACTION_CONTRACT_METADATA,
  ...SMALL_MODULE_ACTION_CONTRACT_METADATA,
  ...WORK_DIRECT_ACTION_CONTRACT_METADATA,
  ...FINANCE_DIRECT_ACTION_CONTRACT_METADATA,
  ...PRODUCTION_QC_ACTION_CONTRACT_METADATA,
  {
    key: "hr.roster.department.update",
    version: 1,
    kind: "write",
    label: "更新部门",
    targetKind: "Department",
    resource: HR_ROSTER_WORKFLOW_UPDATE_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "existing_record",
      targetIdKey: "departmentId",
      notes: "申请 payload 必须包含部门 ID 和部门更新表单字段；审批通过时重新走 domain validator 后更新 Department/DepartmentDescription。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "Department",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["active", "workflowDraft"], defaultMode: "workflowDraft",
      commitMode: "apply_patch",
      notes: "草稿和审批中数据存在 ApprovalRequest.latestPayload；通过后应用到正式部门表。",
    },
    form: {
      adapterKey: "hr.department.update",
      payloadVersion: 1,
      supportedModes: ["direct", "workflow"],
      notes: "业务页和流程详情页应复用同一个部门更新表单 adapter。",
    },
    domain: {
      validatorKey: "packages/hr/server/domain/department-validation.buildDepartmentUpdateCommand",
      commitKey: "packages/hr/server/departments.commitDepartmentUpdateCommand",
      notes: "保存草稿、提交审批、审批通过提交正式表都必须使用同一套 domain validator。",
    },
    api: {
      directRoutes: ["PUT /api/modules/hr/roster/departments", "PUT /api/modules/hr/roster/departments/:id"],
      workflowRoutes: [
        "POST /api/modules/hr/roster/submissions",
        "POST /api/modules/hr/roster/submissions/:id/submit",
        "POST /api/modules/hr/roster/submissions/:id/approve",
      ],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "direct",
      allowDirectOverride: true,
      statuses: ["draft", "submitted", "withdrawn", "rejected", "approved", "failed"],
      transitions: ["submit", "withdraw", "resubmit", "approve", "reject"],
      mutationPolicy: HR_ROSTER_WORKFLOW_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "auto_pass_if_authorized", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [{ key: "hr-roster-department-update-approval", label: "部门更新审批", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "hr.roster", action: "approve" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: true }] },
      configuration: HR_ROSTER_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "V1 只允许单个人工节点；节点配置来自 contract，策略只保存开关和降级到现有 engine 的 routing 字段。",
    },
    display: { titleTemplate: "更新部门：{name}", summaryTemplate: "{code} · {name}", hrefPattern: "/hr/roster?tab=department-position&workflowRequestId={requestId}" },
  },
  ...WORK_GOAL_ACTION_CONTRACTS,
  {
    key: "work.tasks.collaboration.submit",
    version: 1,
    kind: "workflow",
    label: "提交部门协作",
    targetKind: "DepartmentCollaboration",
    resource: WORK_TASKS_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "new_record",
      notes: "提交负责部门、赋能部门、协作名称和说明；审批通过后创建固定部门协作事实。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "DepartmentCollaboration",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["active", "workflowDraft"],
      defaultMode: "active",
      statusField: "status",
      commitMode: "copy_to_active",
      notes: "默认零节点仍完整记录 draft/submit/approved 事件，随后立即写入正式协作表。",
    },
    form: {
      adapterKey: "work.tasks.collaboration",
      payloadVersion: 1,
      supportedPersistenceModes: ["active", "workflowDraft"],
      supportedModes: ["direct", "workflow"],
      notes: "协作目录和未来流程详情复用同一字段契约。",
    },
    domain: {
      validatorKey: "packages/work/server/domain/department-collaboration-validation.buildDepartmentCollaborationCreateCommand",
      commitKey: "packages/work/server/department-collaborations.commitDepartmentCollaborationApproval",
      notes: "提交和 commit 均通过同一部门、标题和赋能部门规则。",
    },
    api: {
      commandRoute: "POST /api/modules/work/tasks/collaborations",
      directRoutes: ["POST /api/modules/work/tasks/collaborations", "PUT /api/modules/work/tasks/collaborations/:id"],
      workflowRoutes: ["POST /api/modules/work/tasks/collaborations", "PUT /api/modules/work/tasks/collaborations/:id"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "workflow",
      allowDirectOverride: true,
      statuses: ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: WORK_TASKS_WORKFLOW_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "auto_pass_if_authorized", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [], notes: "默认不经过人工节点，submit 后立即 commit。" },
      configuration: WORK_TASKS_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "管理员添加节点后，同一提交命令自动进入正常审批链；关闭流程后复用同一 validator 和 commit 直接写入。",
    },
    display: {
      titleTemplate: "部门协作：{title}",
      summaryTemplate: "{title}",
      hrefPattern: "/work/department/{targetId}/space?view=collaboration",
    },
  },
  {
    key: "work.tasks.item.create",
    version: 1,
    kind: "write",
    label: "创建工作节点",
    targetKind: "WorkItem",
    resource: WORK_TASKS_ITEM_CREATE_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "new_record",
      notes: "工作节点创建提交完整节点表单；权限直写和审批通过均重新走 WorkItem domain validator 写入正式节点。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "WorkItem",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["active", "workflowDraft"],
      defaultMode: "active",
      statusField: "status",
      commitMode: "copy_to_active",
      notes: "权限直写直接创建 WorkItem；启用流程时数据存在 ApprovalRequest.latestPayload，通过后调用同一 WorkItem service 创建正式节点。",
    },
    form: {
      adapterKey: "work.tasks.item",
      payloadVersion: 1,
      supportedPersistenceModes: ["active", "workflowDraft"],
      supportedModes: ["direct", "workflow"],
      notes: "工作节点权限直写和流程提交复用同一表单 payload。",
    },
    domain: {
      validatorKey: "packages/work/server/task-approval-adapter.validateCreateItemApprovalPayload",
      commitKey: "packages/work/server/task-approval-adapter.commitWorkItemApproval",
      notes: "提交和通过均校验工作空间、项目可见性、参与人和来源部门边界。",
    },
    api: {
      directRoutes: ["POST /api/modules/work/tasks"],
      workflowRoutes: ["POST /api/modules/work/tasks/submissions", "POST /api/modules/work/tasks/submissions/:id/submit", "POST /api/modules/work/tasks/submissions/:id/approve"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "direct",
      allowDirectOverride: true,
      statuses: ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: WORK_TASKS_WORKFLOW_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "auto_pass_if_authorized", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [{ key: "work-task-item-create-approval", label: "工作节点创建", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "work.tasks", action: "approve" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: true }] },
      configuration: WORK_TASKS_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "组织工作空间工作节点创建默认按权限直写；管理员显式接入流程后，审批通过再写入正式工作节点。",
    },
    display: { titleTemplate: "工作节点新建：{title}", summaryTemplate: "{title}", hrefPattern: "/settings/account?tab=inbox" },
  },
  {
    key: "work.tasks.item.update",
    version: 1,
    kind: "write",
    label: "更新工作节点",
    targetKind: "WorkItem",
    resource: WORK_TASKS_ITEM_UPDATE_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "existing_record",
      targetIdKey: "workId",
      notes: "工作节点更新提交节点 ID 和完整表单 patch；权限直写和审批通过均重新走 WorkItem domain validator。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "WorkItem",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["active", "workflowDraft"],
      defaultMode: "active",
      statusField: "status",
      commitMode: "apply_patch",
      notes: "权限直写直接更新 WorkItem；启用流程时数据存在 ApprovalRequest.latestPayload，通过后调用同一 WorkItem service 更新正式节点。",
    },
    form: {
      adapterKey: "work.tasks.item",
      payloadVersion: 1,
      supportedPersistenceModes: ["active", "workflowDraft"],
      supportedModes: ["direct", "workflow"],
      notes: "工作节点权限直写和流程提交复用同一表单 payload。",
    },
    domain: {
      validatorKey: "packages/work/server/task-approval-adapter.validateUpdateItemApprovalPayload",
      commitKey: "packages/work/server/task-approval-adapter.commitWorkItemApproval",
      notes: "提交和通过均校验工作节点存在性、项目可见性、参与人和来源部门边界。",
    },
    api: {
      directRoutes: ["PUT /api/modules/work/tasks/:id"],
      workflowRoutes: ["POST /api/modules/work/tasks/submissions", "POST /api/modules/work/tasks/submissions/:id/submit", "POST /api/modules/work/tasks/submissions/:id/approve"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "direct",
      allowDirectOverride: true,
      statuses: ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: WORK_TASKS_WORKFLOW_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "auto_pass_if_authorized", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [{ key: "work-task-item-update-approval", label: "工作节点更新", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "work.tasks", action: "approve" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: true }] },
      configuration: WORK_TASKS_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "组织工作空间工作节点更新默认按权限直写；管理员显式接入流程后，审批通过再更新正式工作节点。",
    },
    display: { titleTemplate: "工作节点修改：{title}", summaryTemplate: "{title}", hrefPattern: "/settings/account?tab=inbox" },
  },
  {
    key: "work.tasks.report.save",
    version: 1,
    kind: "write",
    label: "保存工作汇报",
    targetKind: "WorkReport",
    resource: WORK_TASKS_REPORT_SAVE_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "mixed",
      targetIdKey: "reportId",
      notes: "工作汇报流程提交周期、阶段和汇报表格内容；通过后按提交人和周期 upsert 正式汇报。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "WorkReport",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["workflowDraft"],
      defaultMode: "workflowDraft",
      statusField: "status",
      commitMode: "copy_to_active",
      notes: "周/月工作汇报直接保存正式快照；启用目标流程的周期存在 ApprovalRequest.latestPayload，通过后调用 WorkReport service 保存正式汇报。",
    },
    form: {
      adapterKey: "work.tasks.report",
      payloadVersion: 1,
      supportedPersistenceModes: ["active", "workflowDraft"],
      supportedModes: ["direct", "workflow"],
      notes: "周/月工作汇报使用直接保存；目标/考核审批复用报表 payload，按期初目标和考核结果两个阶段展示字段。",
    },
    domain: {
      validatorKey: "packages/work/server/task-approval-reports.validateReportApprovalPayload",
      commitKey: "packages/work/server/task-approval-reports.commitWorkReportApproval",
      notes: "提交和通过均校验汇报对象、周期、阶段和工作空间边界。",
    },
    api: {
      directRoutes: ["PUT /api/modules/work/tasks/reports"],
      workflowRoutes: ["POST /api/modules/work/tasks/submissions", "POST /api/modules/work/tasks/submissions/:id/submit", "POST /api/modules/work/tasks/submissions/:id/approve"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "workflow",
      allowDirectOverride: false,
      statuses: ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: WORK_TASKS_WORKFLOW_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "auto_pass_if_authorized", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [{ key: "work-task-report-save-approval", label: "工作汇报", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "work.tasks", action: "approve" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: true }] },
      configuration: WORK_TASKS_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "工作汇报使用基础 work.tasks 流程；审批通过后写入正式汇报记录。",
    },
    display: { titleTemplate: "工作汇报：{periodStart}", summaryTemplate: "{reportStage} · {periodType}", hrefPattern: "/settings/account?tab=inbox" },
  },
  {
    key: "work.tasks.revision.save",
    version: 1,
    kind: "write",
    label: "提交修订/更正",
    targetKind: "WorkRevision",
    resource: WORK_TASKS_REVISION_SAVE_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "existing_record",
      targetIdKey: "changeTarget",
      notes: "审批后修改 OKR 计划或工作汇报时提交修订 payload；changeTarget=okr_plan/work_report 区分正式对象。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "WorkPlan|WorkReport",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["workflowDraft"],
      defaultMode: "workflowDraft",
      statusField: "status",
      commitMode: "apply_patch",
      notes: "修订草稿存在 ApprovalRequest.latestPayload；审批通过后由 Work adapter 写回对应正式对象。",
    },
    form: {
      adapterKey: "work.tasks.revision",
      payloadVersion: 1,
      supportedPersistenceModes: ["workflowDraft"],
      supportedModes: ["workflow"],
      notes: "修订表单复用原工作计划或工作汇报 UI，审批详情展示 diff/原因。",
    },
    domain: {
      validatorKey: "packages/work/server/task-approval-adapter.validateRevisionApprovalPayload",
      commitKey: "packages/work/server/task-approval-adapter.commitRevisionApproval",
      notes: "提交和通过均校验原对象、工作空间、来源边界和项目可见性。",
    },
    api: {
      workflowRoutes: ["POST /api/modules/work/tasks/submissions", "POST /api/modules/work/tasks/submissions/:id/submit", "POST /api/modules/work/tasks/submissions/:id/approve"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "workflow",
      allowDirectOverride: false,
      statuses: ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: WORK_TASKS_WORKFLOW_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "auto_pass_if_authorized", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [{ key: "work-task-revision-save-approval", label: "修订/更正", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "work.tasks", action: "approve" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: true }] },
      configuration: WORK_TASKS_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "审批后的 OKR 计划和工作汇报实质修改统一走修订流程。",
    },
    display: { titleTemplate: "修订：{changeTarget}", summaryTemplate: "{reason}", hrefPattern: "/settings/account?tab=inbox" },
  },
  {
    key: "hr.performance.review.evaluate",
    version: 1,
    kind: "write",
    label: "发起绩效评审",
    targetKind: "HrPerformanceReview",
    resource: HR_PERFORMANCE_WORKFLOW_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "new_record",
      notes: "申请 payload 包含员工、OKR 周期、自评分/评语、直属上级评分/评语、HR 最终分/等级/评语；OKR/工作数据在最终通过时重新抓取并固化快照。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "HrPerformanceReview",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["workflowDraft"],
      defaultMode: "workflowDraft",
      commitMode: "copy_to_active",
      notes: "草稿、提交、阶段评分均存在 ApprovalRequest.latestPayload；HR 最终 approve 后写入 HR-owned 正式绩效表。",
    },
    form: {
      adapterKey: "hr.performance.review",
      payloadVersion: 1,
      supportedPersistenceModes: ["workflowDraft"],
      supportedModes: ["workflow"],
      notes: "绩效页和流程详情页复用员工自评、上级评分、HR 终评三个阶段字段。",
    },
    domain: {
      validatorKey: "packages/hr/server/performance.validateHrPerformancePayload",
      commitKey: "packages/hr/server/performance.commitHrPerformanceApprovedPayload",
      notes: "校验员工、周期、重复正式记录、评分范围、等级和当前阶段可写字段；正式记录只由审批通过路径创建。",
    },
    api: {
      workflowRoutes: [
        "POST /api/modules/hr/performance/submissions",
        "PUT /api/modules/hr/performance/submissions/:id",
        "POST /api/modules/hr/performance/submissions/:id/submit",
        "POST /api/modules/hr/performance/submissions/:id/withdraw",
        "POST /api/modules/hr/performance/submissions/:id/cancel",
        "POST /api/modules/hr/performance/submissions/:id/comment",
        "POST /api/modules/hr/performance/submissions/:id/approve",
        "POST /api/modules/hr/performance/submissions/:id/reject",
      ],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "workflow",
      allowDirectOverride: true,
      statuses: ["draft", "submitted", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: HR_PERFORMANCE_WORKFLOW_MUTATION,
      routing: { handlerSource: "direct_manager", separationPolicy: "auto_pass_if_authorized", approvalMode: "any_one" },
      defaultDefinition: {
        version: 1,
        nodes: [
          { key: "hr-performance-direct-manager-review", label: "直属上级评分", kind: "approval", assignee: { kind: "direct_manager" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: false },
          { key: "hr-performance-final-review", label: "HR 审批归档", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "hr.performance", action: "approve" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: false },
        ],
      },
      configuration: HR_PERFORMANCE_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "默认流程为员工自评 -> 直属上级评分 -> HR 最终评分归档；WorkflowPolicy 可覆盖节点，但必须仍走 ApprovalRequest。",
    },
    display: {
      titleTemplate: "绩效评审：{employeeName}",
      summaryTemplate: "{cycleLabel} · 最终等级 {finalGrade}",
      hrefPattern: "/work/performance?workflowRequestId={requestId}",
    },
  },
]);
