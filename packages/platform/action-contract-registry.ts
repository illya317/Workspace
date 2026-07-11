import {
  defineActionContractMetadataList,
  type ActionContractMetadata,
} from "./action-contract";
import { ADDITIONAL_ACTION_CONTRACT_METADATA } from "./action-contract-registry-additional";

const HR_ROSTER_RESOURCE = {
  resourceKey: "hr.roster",
  moduleKey: "hr",
  scopeTypes: ["global"],
  directPermissionAction: "create",
} as const;

const HR_ROSTER_WORKFLOW_CREATE_RESOURCE = {
  ...HR_ROSTER_RESOURCE,
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const HR_CREATE_WORKFLOW_MUTATION = {
  handlerCanRevise: true,
  requestCanWithdraw: true,
  requestCanRevise: true,
  requestCanCancel: true,
  requestCanResubmit: true,
} as const;

const HR_CREATE_WORKFLOW_CONFIGURATION = {
  nodeKinds: ["approval"],
  assigneeKinds: ["permission_holders", "direct_manager", "department_owner", "position", "employee"],
  approvalModes: ["any_one", "all"],
  separationPolicies: ["auto_pass_if_authorized", "independent_required"],
  allowNodeAddRemove: true,
  allowBypassConditions: true,
  maxNodes: 8,
} as const;

const DOCS_EDITOR_RESOURCE = {
  resourceKey: "docs.editor",
  moduleKey: "docs",
  scopeTypes: ["company", "committee", "department"],
} as const;

const DOCS_TEMPLATE_CREATE_RESOURCE = {
  ...DOCS_EDITOR_RESOURCE,
  directPermissionAction: "create",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const DOCS_TEMPLATE_PUBLISH_RESOURCE = {
  ...DOCS_EDITOR_RESOURCE,
  directPermissionAction: "update",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const DOCS_TEMPLATE_WORKFLOW_MUTATION = {
  handlerCanRevise: false,
  requestCanWithdraw: true,
  requestCanRevise: true,
  requestCanCancel: true,
  requestCanResubmit: true,
} as const;

const DOCS_TEMPLATE_WORKFLOW_CONFIGURATION = {
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

const WORK_TASKS_REVIEW_WORKFLOW_MUTATION = {
  handlerCanRevise: true,
  requestCanWithdraw: true,
  requestCanRevise: true,
  requestCanCancel: true,
  requestCanResubmit: true,
} as const;

const WORK_TASKS_REVIEW_WORKFLOW_CONFIGURATION = {
  nodeKinds: ["approval"],
  assigneeKinds: ["permission_holders", "direct_manager", "department_owner", "position", "employee"],
  approvalModes: ["any_one", "all"],
  separationPolicies: ["auto_pass_if_authorized", "independent_required"],
  allowNodeAddRemove: true,
  allowBypassConditions: true,
  maxNodes: 8,
} as const;

export const ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  {
    key: "hr.roster.department.create",
    version: 1,
    kind: "write",
    label: "创建部门",
    targetKind: "Department",
    resource: HR_ROSTER_WORKFLOW_CREATE_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "new_record",
      notes: "申请 payload 必须是创建部门表单的完整字段；审批通过时重新走 domain validator 后写入 Department/DepartmentDescription。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "Department",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["active", "workflowDraft"], defaultMode: "workflowDraft",
      commitMode: "copy_to_active",
      notes: "草稿和审批中数据存在 ApprovalRequest.latestPayload；通过后复制到正式部门表。",
    },
    form: {
      adapterKey: "hr.department.create",
      payloadVersion: 1,
      supportedModes: ["direct", "workflow"],
      notes: "业务页和流程详情页应复用同一个部门创建表单 adapter。",
    },
    domain: {
      validatorKey: "packages/hr/server/domain/department-validation.buildDepartmentCreateCommand",
      commitKey: "packages/hr/server/departments.commitDepartmentCreateCommand",
      notes: "保存草稿、提交审批、审批通过提交正式表都必须使用同一套 domain validator。",
    },
    api: {
      directRoutes: ["POST /api/modules/hr/roster/departments"],
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
      mutationPolicy: HR_CREATE_WORKFLOW_MUTATION,
      routing: {
        handlerSource: "permission",
        separationPolicy: "auto_pass_if_authorized",
        approvalMode: "any_one",
      },
      defaultDefinition: {
        version: 1,
        nodes: [{
          key: "hr-roster-department-create-approval",
          label: "部门创建审批",
          kind: "approval",
          assignee: { kind: "permission_holders", resourceKey: "hr.roster", action: "approve" },
          approvalMode: "any_one",
          separationPolicy: "auto_pass_if_authorized",
          bypassable: true,
        }],
      },
      configuration: HR_CREATE_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "V1 只允许单个人工节点；节点配置来自 contract，策略只保存开关和降级到现有 engine 的 routing 字段。",
    },
    display: {
      titleTemplate: "创建部门：{name}",
      summaryTemplate: "{code} · {name}",
      hrefPattern: "/hr/roster?tab=department-position&workflowRequestId={requestId}",
    },
  },
  {
    key: "hr.roster.position.create",
    version: 1,
    kind: "write",
    label: "创建岗位",
    targetKind: "Position",
    resource: HR_ROSTER_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "new_record",
      notes: "申请 payload 必须包含岗位基础信息和可选岗位说明书，不能只存展示摘要。",
    },
    persistence: {
      strategy: "active_table_state",
      activeEntity: "Position",
      supportedPersistenceModes: ["active"], defaultMode: "active",
      commitMode: "activate",
      notes: "当前岗位创建仍是权限直写；contract 先锁定表单、domain、API 语义，后续接流程时改为 approval_payload。",
    },
    form: {
      adapterKey: "hr.position.create",
      payloadVersion: 1,
      supportedModes: ["direct"],
      notes: "岗位创建面板和未来流程详情页应复用同一个岗位创建表单 adapter。",
    },
    domain: {
      validatorKey: "packages/hr/server/domain/position-validation.buildPositionCreateCommand",
      commitKey: "packages/hr/server/positions.commitPositionCreateCommand",
    },
    api: {
      directRoutes: ["POST /api/modules/hr/roster/positions"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "not_applicable",
      reason: "岗位创建按权限直接写入；接入流程前必须补 adapter、submission route、approved commit path 和状态 UI。",
    },
    display: {
      titleTemplate: "创建岗位：{name}",
      summaryTemplate: "{code} · {name}",
      hrefPattern: "/hr/roster?tab=department-position&positionId={result.id}",
    },
  },
  {
    key: "hr.roster.position.update",
    version: 1,
    kind: "write",
    label: "更新岗位",
    targetKind: "Position",
    resource: { ...HR_ROSTER_RESOURCE, directPermissionAction: "update" },
    payload: {
      cardinality: "single",
      shape: "field_patch",
      target: "existing_record",
      targetIdKey: "id",
      notes: "岗位主数据和可选说明书通过同一个异步 domain command 校验；组织范围与归档引用规则不在 route 重复实现。",
    },
    persistence: {
      strategy: "active_table_state",
      activeEntity: "Position",
      supportedPersistenceModes: ["active"],
      defaultMode: "active",
      commitMode: "apply_patch",
      notes: "事务内更新 Position、按需创建说明书、同步职责节点并写入历史快照。",
    },
    form: {
      adapterKey: "hr.position.update",
      payloadVersion: 1,
      supportedModes: ["direct"],
      notes: "岗位编辑和说明书创建复用岗位表单字段契约。",
    },
    domain: {
      validatorKey: "packages/hr/server/domain/position-validation.buildPositionUpdateCommand",
      commitKey: "packages/hr/server/positions.commitPositionUpdateCommand",
    },
    api: {
      commandRoute: "PUT /api/modules/hr/roster/positions",
      directRoutes: [
        "PUT /api/modules/hr/roster/positions",
        "PUT /api/modules/hr/roster/positions/:id",
      ],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "not_applicable",
      reason: "岗位更新当前按权限直接写入；归档是独立 lifecycle action，不混入该 Contract。",
    },
    display: {
      titleTemplate: "更新岗位：{name}",
      summaryTemplate: "{code} · {name}",
      hrefPattern: "/hr/roster?tab=department-position&positionId={id}",
    },
  },
  {
    key: "docs.editor.template.draft.create",
    version: 1,
    kind: "write",
    label: "创建文档模板草稿",
    targetKind: "DocumentTemplate",
    resource: DOCS_TEMPLATE_CREATE_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "new_record",
      notes: "新建模板流程提交完整模板快照；审批通过后创建/发布为正式模板版本。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "DocumentTemplate",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["active", "workflowDraft"], defaultMode: "active",
      commitMode: "copy_to_active",
      notes: "流程数据存在 ApprovalRequest.latestPayload；通过后写入 DocumentTemplate 并生成版本内容文件。",
    },
    form: {
      adapterKey: "docs.editor.template",
      payloadVersion: 1,
      supportedModes: ["direct", "workflow"],
      notes: "流程提交和流程详情应复用文档模板编辑器表单，不维护第二套字段。",
    },
    domain: {
      validatorKey: "packages/platform/server/docs-editor/domain/document-template-validation.buildSaveDraftCommand",
      commitKey: "packages/platform/server/docs-editor/service.saveDraft",
      notes: "提交和通过都走同一套模板 domain validator。",
    },
    api: {
      directRoutes: ["POST /api/modules/docs/editor"],
      workflowRoutes: [
        "POST /api/modules/docs/editor/submissions",
        "POST /api/modules/docs/editor/submissions/:id/submit",
        "POST /api/modules/docs/editor/submissions/:id/approve",
      ],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "direct",
      allowDirectOverride: true,
      statuses: ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: DOCS_TEMPLATE_WORKFLOW_MUTATION,
      routing: {
        handlerSource: "permission",
        separationPolicy: "auto_pass_if_authorized",
        approvalMode: "any_one",
      },
      defaultDefinition: {
        version: 1,
        nodes: [{
          key: "docs-template-create-approval",
          label: "模板新建审批",
          kind: "approval",
          assignee: { kind: "permission_holders", resourceKey: "docs.editor", action: "approve" },
          approvalMode: "any_one",
          separationPolicy: "auto_pass_if_authorized",
          bypassable: true,
        }],
      },
      configuration: DOCS_TEMPLATE_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "V1 单节点审批；新建模板流程本质是提交新模板发布快照。",
    },
    display: {
      titleTemplate: "新建文档模板：{title}",
      summaryTemplate: "{title}",
      hrefPattern: "/docs/editor?approvalId={requestId}",
    },
  },
  {
    key: "docs.editor.template.publish",
    version: 1,
    kind: "write",
    label: "发布文档模板",
    targetKind: "DocumentTemplate",
    resource: DOCS_TEMPLATE_PUBLISH_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "existing_record",
      targetIdKey: "templateId",
      versionKey: "version",
      notes: "发布流程提交当前模板完整快照；审批通过发布这份快照，不重新读取后续草稿。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "DocumentTemplate",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["active", "workflowDraft"], defaultMode: "active",
      commitMode: "copy_to_active",
      notes: "草稿保存仍是滚动直写；发布请求快照存在 ApprovalRequest，通过后生成永久版本内容。",
    },
    form: {
      adapterKey: "docs.editor.template",
      payloadVersion: 1,
      supportedModes: ["direct", "workflow"],
      notes: "业务页和流程详情页应复用文档模板编辑器表单。",
    },
    domain: {
      validatorKey: "packages/platform/server/docs-editor/domain/document-template-validation.buildSaveDraftCommand",
      commitKey: "packages/platform/server/docs-editor/publish-service.publishTemplateSnapshot",
      notes: "提交发布和审批通过均复用模板 domain validator；通过时校验版本和完整快照。",
    },
    api: {
      directRoutes: ["POST /api/modules/docs/editor/templates/:templateId/publish"],
      workflowRoutes: [
        "POST /api/modules/docs/editor/submissions",
        "POST /api/modules/docs/editor/submissions/:id/submit",
        "POST /api/modules/docs/editor/submissions/:id/approve",
      ],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "configurable",
      defaultExecutionMode: "direct",
      allowDirectOverride: true,
      statuses: ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled", "failed"],
      transitions: ["submit", "withdraw", "cancel", "resubmit", "approve", "reject"],
      mutationPolicy: DOCS_TEMPLATE_WORKFLOW_MUTATION,
      routing: {
        handlerSource: "permission",
        separationPolicy: "auto_pass_if_authorized",
        approvalMode: "any_one",
      },
      defaultDefinition: {
        version: 1,
        nodes: [{
          key: "docs-template-publish-approval",
          label: "模板发布审批",
          kind: "approval",
          assignee: { kind: "permission_holders", resourceKey: "docs.editor", action: "approve" },
          approvalMode: "any_one",
          separationPolicy: "auto_pass_if_authorized",
          bypassable: true,
        }],
      },
      configuration: DOCS_TEMPLATE_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "V1 单节点审批；保存草稿不接流程，发布才进入流程。",
    },
    display: {
      titleTemplate: "发布文档模板：{title}",
      summaryTemplate: "{title}",
      hrefPattern: "/docs/editor?approvalId={requestId}",
    },
  },
  {
    key: "work.tasks.objective_plan.save",
    version: 1,
    kind: "write",
    label: "提交目标审查",
    targetKind: "WorkPlan",
    resource: WORK_TASKS_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "existing_record",
      targetIdKey: "planId",
      notes: "目标审查流程提交 OKR 计划 ID 和标题；提交后进入目标待审，通过后进入执行中。",
    },
    persistence: {
      strategy: "approval_payload",
      activeEntity: "WorkPlan",
      draftEntity: "ApprovalRequest",
      supportedPersistenceModes: ["workflowDraft"], defaultMode: "workflowDraft",
      statusField: "okrStage",
      commitMode: "native_transition",
      notes: "流程数据存在 ApprovalRequest.latestPayload；通过后调用 OKR 阶段服务推进 objective_submitted -> executing。",
    },
    form: {
      adapterKey: "work.tasks.objective_plan.review",
      payloadVersion: 1,
      surfaceKey: "work.tasks.okrPlan",
      snapshotPath: "latestPayload.data.approvalSnapshot",
      persistenceMode: "workflowDraft",
      workflowRole: "processor",
      editPolicy: "workflowConfigured",
      notes: "目标审查流程详情复用 OKR 计划 renderer；表单行为由 persistenceMode/workflowRole/editPolicy 三轴决定。",
    },
    domain: {
      validatorKey: "packages/work/server/task-approval-okr.validateObjectivePlanApprovalPayload",
      commitKey: "packages/work/server/task-approval-okr.commitObjectivePlanApproval",
      notes: "提交和通过均校验 OKR 计划阶段，避免绕过 objective_draft/objective_submitted 状态机。",
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
      mutationPolicy: WORK_TASKS_REVIEW_WORKFLOW_MUTATION,
      routing: {
        handlerSource: "permission",
        separationPolicy: "auto_pass_if_authorized",
        approvalMode: "any_one",
      },
      defaultDefinition: { version: 1, nodes: [{ key: "work-task-objective-plan-approval", label: "目标审查", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "work.tasks", action: "approve" }, approvalMode: "any_one", separationPolicy: "auto_pass_if_authorized", bypassable: true }] },
      configuration: WORK_TASKS_REVIEW_WORKFLOW_CONFIGURATION,
      validateOn: ["draft", "submit", "commit"],
      notes: "目标审查是 OKR 原生阶段流转入口，必须通过流程单推进，不作为普通计划保存动作处理。",
    },
    display: { titleTemplate: "目标审查：{title}", summaryTemplate: "{title}", hrefPattern: "/settings/account?tab=inbox" },
  },
  ...ADDITIONAL_ACTION_CONTRACT_METADATA,
] as const satisfies readonly ActionContractMetadata[]);

export function listActionContractMetadata(): readonly ActionContractMetadata[] {
  return ACTION_CONTRACT_METADATA;
}

export function getActionContractMetadata(key: string): ActionContractMetadata | null {
  return ACTION_CONTRACT_METADATA.find((contract) => contract.key === key) ?? null;
}
