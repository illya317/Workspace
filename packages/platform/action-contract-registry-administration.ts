import { defineActionContractMetadataList } from "./action-contract";
import { registeredImport, registeredLifecycle, registeredWrite } from "./action-contract-registry-helpers";

const ADMINISTRATION_CONTRACT_RESOURCE = {
  resourceKey: "administration.contracts",
  moduleKey: "administration",
  scopeTypes: ["global"],
} as const;

const ADMINISTRATION_ERP_DILIGENCE_RESOURCE = {
  resourceKey: "administration.erpDiligence",
  moduleKey: "administration",
  scopeTypes: ["global"],
} as const;

const ACTIVE_CONTRACT_PERSISTENCE = {
  strategy: "active_table_state",
  activeEntity: "Contract",
  supportedPersistenceModes: ["active"],
  defaultMode: "active",
} as const;

const ACTIVE_ERP_DILIGENCE_PERSISTENCE = {
  strategy: "active_table_state",
  activeEntity: "ErpDueDiligenceSubmission",
  supportedPersistenceModes: ["active"],
  defaultMode: "active",
} as const;

const DIRECT_ONLY = {
  kind: "not_applicable",
  reason: "行政合同当前是权限直写命令，没有审批草稿或业务原生流程状态。",
} as const;

export const ADMINISTRATION_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  {
    key: "administration.erpDiligence.save",
    version: 1,
    kind: "write",
    label: "保存ERP流程尽调",
    targetKind: "ErpDueDiligenceSubmission",
    resource: { ...ADMINISTRATION_ERP_DILIGENCE_RESOURCE, directPermissionAction: "update" },
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "mixed",
      notes: "每位用户在当前尽调批次中只有一份记录；服务端绑定当前用户并按批次执行 upsert。",
    },
    persistence: { ...ACTIVE_ERP_DILIGENCE_PERSISTENCE, commitMode: "native_transition" },
    domain: {
      validatorKey: "packages/administration/server/domain/erp-diligence-validation.buildErpDiligenceSaveCommand",
      commitKey: "packages/administration/server/erp-diligence.commitErpDiligenceSaveCommand",
    },
    api: {
      commandRoute: "PUT /api/modules/administration/erp-diligence",
      directRoutes: ["PUT /api/modules/administration/erp-diligence"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "not_applicable",
      reason: "流程尽调是当前用户维护自己的事实采集表，不产生审批草稿。",
    },
    display: {
      titleTemplate: "保存ERP流程尽调",
      summaryTemplate: "{departmentName} · {primaryArea}",
      hrefPattern: "/administration/erp-diligence",
    },
  },
  registeredImport({
    key: "administration.erpDiligence.evidence.upload",
    activeEntity: "ErpDueDiligenceEvidenceAttachment",
    transport: "file",
    result: "records",
    domain: {
      validatorKey: "packages/administration/server/domain/erp-diligence-attachment-validation.buildErpDiligenceEvidenceUploadCommand",
      commitKey: "packages/administration/server/erp-diligence-evidence.uploadErpDiligenceEvidenceAttachment",
    },
  }),
  registeredLifecycle({
    key: "administration.erpDiligence.evidence.delete",
    activeEntity: "ErpDueDiligenceEvidenceAttachment",
    operation: "delete",
    targetIdKey: "attachmentUid",
    deleteMode: "hard",
    referencePolicy: "domain",
    auditPolicy: "none",
    domain: {
      validatorKey: "packages/administration/server/domain/erp-diligence-attachment-validation.buildErpDiligenceEvidenceAttachmentCommand",
      commitKey: "packages/administration/server/erp-diligence-evidence.deleteErpDiligenceEvidenceAttachment",
    },
  }),
  {
    key: "administration.contract.export",
    version: 1,
    kind: "exchange",
    label: "下载行政合同台账",
    targetKind: "ContractExport",
    resource: { ...ADMINISTRATION_CONTRACT_RESOURCE, directPermissionAction: "export" },
    payload: {
      cardinality: "batch",
      shape: "full_record",
      target: "mixed",
      notes: "导出全部匹配合同，不受当前列表分页限制；查询条件沿用合同台账筛选条件。",
    },
    exchange: {
      direction: "export",
      transport: "file",
      result: "file",
      contentTypes: ["text/csv; charset=utf-8"],
      notes: "响应是带 UTF-8 BOM 的合同台账 CSV 文件，不产生业务持久化。",
    },
    domain: {
      executeKey: "packages/administration/server/contracts.exportContracts",
    },
    api: {
      commandRoute: "GET /api/modules/administration/contracts/export",
      directRoutes: ["GET /api/modules/administration/contracts/export"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "not_applicable",
      reason: "合同台账下载是只读文件生成，不创建审批草稿或正式业务记录。",
    },
    display: {
      titleTemplate: "下载行政合同台账",
      hrefPattern: "/administration/contracts",
    },
  },
  {
    key: "administration.contract.create",
    version: 1,
    kind: "write",
    label: "创建行政合同",
    targetKind: "Contract",
    resource: { ...ADMINISTRATION_CONTRACT_RESOURCE, directPermissionAction: "create" },
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "new_record",
      notes: "服务端身份写入 editedBy；金额和可空文本由 domain command 统一归一化。",
    },
    persistence: { ...ACTIVE_CONTRACT_PERSISTENCE, commitMode: "activate" },
    domain: {
      validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractCreateCommand",
      commitKey: "packages/administration/server/contracts.commitCreateContractCommand",
    },
    api: {
      commandRoute: "POST /api/modules/administration/contracts",
      directRoutes: ["POST /api/modules/administration/contracts"],
      envelopeVersion: 1,
    },
    workflow: DIRECT_ONLY,
    display: {
      titleTemplate: "创建行政合同：{name}",
      summaryTemplate: "{contractNo} · {partyA} / {partyB}",
      hrefPattern: "/administration/contracts",
    },
  },
  {
    key: "administration.contract.update",
    version: 1,
    kind: "write",
    label: "更新行政合同",
    targetKind: "Contract",
    resource: { ...ADMINISTRATION_CONTRACT_RESOURCE, directPermissionAction: "update" },
    payload: {
      cardinality: "single",
      shape: "field_patch",
      target: "existing_record",
      targetIdKey: "id",
      notes: "拒绝空 patch；服务端身份写入 editedBy，并在提交时递增 version。",
    },
    persistence: { ...ACTIVE_CONTRACT_PERSISTENCE, commitMode: "apply_patch" },
    domain: {
      validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractUpdateCommand",
      commitKey: "packages/administration/server/contracts.commitUpdateContractCommand",
    },
    api: {
      commandRoute: "PATCH /api/modules/administration/contracts/:id",
      directRoutes: ["PATCH /api/modules/administration/contracts/:id"],
      envelopeVersion: 1,
    },
    workflow: DIRECT_ONLY,
    display: {
      titleTemplate: "更新行政合同：{name}",
      summaryTemplate: "合同 #{id}",
      hrefPattern: "/administration/contracts",
    },
  },
  registeredImport({
    key: "administration.contract.attachment.upload",
    activeEntity: "ContractAttachment",
    transport: "file",
    result: "records",
    domain: {
      validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractAttachmentUploadCommand",
      commitKey: "packages/administration/server/contract-package.commitUploadContractAttachment",
    },
  }),
  registeredWrite({
    key: "administration.contract.record.create",
    activeEntity: "ContractRecord",
    shape: "full_record",
    target: "new_record",
    commitMode: "activate",
    domain: {
      validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractRecordCreateCommand",
      commitKey: "packages/administration/server/contract-package.commitCreateContractRecord",
    },
  }),
  registeredWrite({
    key: "administration.contract.approvalReference.set",
    activeEntity: "Contract",
    targetIdKey: "contractId",
    domain: {
      validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractApprovalReferenceCommand",
      commitKey: "packages/administration/server/contract-package.commitSetContractApprovalReference",
    },
  }),
  registeredLifecycle({
    key: "administration.contract.attachment.remove",
    activeEntity: "ContractAttachment",
    operation: "custom",
    targetIdKey: "attachmentUid",
    deleteMode: "soft",
    referencePolicy: "domain",
    auditPolicy: "event",
    domain: {
      validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractAttachmentRemoveCommand",
      commitKey: "packages/administration/server/contract-package.commitRemoveContractAttachment",
    },
  }),
  {
    key: "administration.contract.archive",
    version: 1,
    kind: "lifecycle",
    label: "归档行政合同",
    targetKind: "Contract",
    resource: { ...ADMINISTRATION_CONTRACT_RESOURCE, directPermissionAction: "archive" },
    payload: {
      cardinality: "single",
      shape: "field_patch",
      target: "existing_record",
      targetIdKey: "id",
      versionKey: "expectedVersion",
      notes: "If-Match 版本与合同记录访问范围在同一归档命令中校验。",
    },
    lifecycle: {
      operation: "archive",
      targetIdKey: "id",
      versionKey: "expectedVersion",
      referencePolicy: "domain",
      auditPolicy: "history",
      notes: "合同事实保留不物理删除，并记录 archivedAt、archivedBy 与编辑历史。",
    },
    persistence: { ...ACTIVE_CONTRACT_PERSISTENCE, commitMode: "native_transition" },
    domain: {
      validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractTargetCommand",
      commitKey: "packages/administration/server/contracts.commitArchiveContractCommand",
    },
    api: {
      commandRoute: "POST /api/modules/administration/contracts/:id/archive",
      directRoutes: ["POST /api/modules/administration/contracts/:id/archive"],
      envelopeVersion: 1,
    },
    workflow: DIRECT_ONLY,
    display: {
      titleTemplate: "归档行政合同 #{id}",
      hrefPattern: "/administration/contracts",
    },
  },
  {
    key: "administration.contract.delete",
    version: 1,
    kind: "lifecycle",
    label: "删除行政合同",
    targetKind: "Contract",
    resource: { ...ADMINISTRATION_CONTRACT_RESOURCE, directPermissionAction: "delete" },
    payload: {
      cardinality: "single",
      shape: "field_patch",
      target: "existing_record",
      targetIdKey: "id",
      versionKey: "expectedVersion",
      notes: "仅草稿合同允许硬删除；正式记录必须使用归档。If-Match 版本进入同一个删除 command。",
    },
    lifecycle: {
      operation: "delete",
      targetIdKey: "id",
      versionKey: "expectedVersion",
      deleteMode: "hard",
      referencePolicy: "none",
      auditPolicy: "history",
      notes: "提交委托 guardedDelete；domain 钩子只允许 lifecycleStatus=draft。",
    },
    persistence: { ...ACTIVE_CONTRACT_PERSISTENCE, commitMode: "native_transition" },
    domain: {
      validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractTargetCommand",
      commitKey: "packages/administration/server/contracts.commitDeleteContractCommand",
    },
    api: {
      commandRoute: "DELETE /api/modules/administration/contracts/:id",
      directRoutes: ["DELETE /api/modules/administration/contracts/:id"],
      envelopeVersion: 1,
    },
    workflow: DIRECT_ONLY,
    display: {
      titleTemplate: "删除行政合同 #{id}",
      hrefPattern: "/administration/contracts",
    },
  },
]);
