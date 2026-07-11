import { defineActionContractMetadataList } from "./action-contract";

const QC_RESOURCE = {
  resourceKey: "production.qc",
  moduleKey: "production",
  scopeTypes: ["global"],
  directPermissionAction: "update",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
} as const;

const QC_NATIVE_MUTATION = {
  handlerCanRevise: false,
  requestCanWithdraw: false,
  requestCanRevise: false,
  requestCanCancel: false,
  requestCanResubmit: false,
} as const;

const QC_NATIVE_CONFIGURATION = {
  nodeKinds: ["review"],
  assigneeKinds: ["permission_holders"],
  approvalModes: ["any_one"],
  separationPolicies: ["independent_required"],
  allowNodeAddRemove: false,
  allowBypassConditions: false,
  maxNodes: 1,
} as const;

function nativeReviewNode(key: string, label: string) {
  return {
    key,
    label,
    kind: "review" as const,
    assignee: { kind: "permission_holders" as const, resourceKey: "production.qc", action: "approve" },
    approvalMode: "any_one" as const,
    separationPolicy: "independent_required" as const,
    bypassable: false,
  };
}

export const PRODUCTION_QC_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  {
    key: "production.qc.batch.precheck.save",
    version: 1,
    kind: "workflow",
    label: "保存 QC 预检记录",
    targetKind: "QcBatchPrecheck",
    resource: QC_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "field_patch",
      target: "existing_record",
      targetIdKey: "batchId",
      notes: "payload 固定包含 batchId、stageKey 和预检 fields；保存人签名由服务端账号身份生成。",
    },
    persistence: {
      strategy: "active_table_state",
      activeEntity: "QcBatch",
      supportedPersistenceModes: ["active"],
      defaultMode: "active",
      commitMode: "native_transition",
      notes: "QC 使用业务原生 JSON 状态与签名字段记录提交/复核，不创建 ApprovalRequest。",
    },
    form: {
      adapterKey: "production.qc.precheck",
      payloadVersion: 1,
      persistenceMode: "active",
      supportedPersistenceModes: ["active"],
      workflowRole: "submitter",
      editPolicy: "workflowConfigured",
      supportedModes: ["native"],
      notes: "批次预检页同时承担填写、签名和原生复核状态展示。",
    },
    domain: {
      validatorKey: "packages/production/server/qc/domain/qc-validation.buildUpdateQcBatchPrecheckCommand",
      commitKey: "packages/production/server/qc/batches.updateQcBatchPrecheck",
    },
    api: {
      commandRoute: "PATCH /api/modules/production/qc/:batchId",
      directRoutes: ["PATCH /api/modules/production/qc/:batchId"],
      workflowRoutes: ["POST /api/modules/production/qc/:batchId/approve-review"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "native",
      defaultExecutionMode: "native",
      allowDirectOverride: false,
      statuses: ["draft", "submitted", "approved"],
      transitions: ["submit", "approve"],
      mutationPolicy: QC_NATIVE_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "independent_required", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [nativeReviewNode("qc-precheck-review", "QC 预检复核")] },
      configuration: QC_NATIVE_CONFIGURATION,
      validateOn: ["submit", "commit"],
      notes: "原生流程固定为检验人签名后由具有 approve 权限的其他人员复核；策略仅控制是否启用。",
    },
    display: {
      titleTemplate: "QC 预检：{stageKey}",
      summaryTemplate: "批次 {batchId}",
      hrefPattern: "/production/qc/{batchId}",
    },
  },
  {
    key: "production.qc.batch.inspection.save",
    version: 1,
    kind: "workflow",
    label: "保存 QC 检验记录",
    targetKind: "QcBatchInspection",
    resource: QC_RESOURCE,
    payload: {
      cardinality: "single",
      shape: "field_patch",
      target: "existing_record",
      targetIdKey: "batchId",
      notes: "payload 固定包含 batchId、stageKey、testName 和检验 fields；检验人签名由服务端账号身份生成。",
    },
    persistence: {
      strategy: "active_table_state",
      activeEntity: "QcBatch",
      supportedPersistenceModes: ["active"],
      defaultMode: "active",
      commitMode: "native_transition",
      notes: "每个检验项目在 QcBatch 原生状态中保存检验、复核签名和完成状态。",
    },
    form: {
      adapterKey: "production.qc.inspection",
      payloadVersion: 1,
      persistenceMode: "active",
      supportedPersistenceModes: ["active"],
      workflowRole: "submitter",
      editPolicy: "workflowConfigured",
      supportedModes: ["native"],
      notes: "检验记录页复用正式 EditorDocument/FieldModel 表单并显示原生复核状态。",
    },
    domain: {
      validatorKey: "packages/production/server/qc/domain/qc-validation.buildUpdateQcBatchWorkflowCommand",
      commitKey: "packages/production/server/qc/batches.updateQcBatchWorkflow",
    },
    api: {
      commandRoute: "PATCH /api/modules/production/qc/:batchId",
      directRoutes: ["PATCH /api/modules/production/qc/:batchId"],
      workflowRoutes: ["POST /api/modules/production/qc/:batchId/approve-review"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "native",
      defaultExecutionMode: "native",
      allowDirectOverride: false,
      statuses: ["draft", "submitted", "approved"],
      transitions: ["submit", "approve"],
      mutationPolicy: QC_NATIVE_MUTATION,
      routing: { handlerSource: "permission", separationPolicy: "independent_required", approvalMode: "any_one" },
      defaultDefinition: { version: 1, nodes: [nativeReviewNode("qc-inspection-review", "QC 检验复核")] },
      configuration: QC_NATIVE_CONFIGURATION,
      validateOn: ["submit", "commit"],
      notes: "原生流程固定为检验人签名后由具有 approve 权限的其他人员复核；策略仅控制是否启用。",
    },
    display: {
      titleTemplate: "QC 检验：{testName}",
      summaryTemplate: "批次 {batchId} · {stageKey}",
      hrefPattern: "/production/qc/{batchId}",
    },
  },
]);
