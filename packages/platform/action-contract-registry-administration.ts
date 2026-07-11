import { defineActionContractMetadataList } from "./action-contract";

const ADMINISTRATION_CONTRACT_RESOURCE = {
  resourceKey: "administration.contracts",
  moduleKey: "administration",
  scopeTypes: ["global"],
} as const;

const ACTIVE_CONTRACT_PERSISTENCE = {
  strategy: "active_table_state",
  activeEntity: "Contract",
  supportedPersistenceModes: ["active"],
  defaultMode: "active",
} as const;

const DIRECT_ONLY = {
  kind: "not_applicable",
  reason: "行政合同当前是权限直写命令，没有审批草稿或业务原生流程状态。",
} as const;

export const ADMINISTRATION_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
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
      notes: "If-Match 版本进入同一个删除 command，避免校验和提交分别解析请求。",
    },
    lifecycle: {
      operation: "delete",
      targetIdKey: "id",
      versionKey: "expectedVersion",
      deleteMode: "hard",
      referencePolicy: "none",
      auditPolicy: "history",
      notes: "提交委托 guardedDelete，保留版本冲突和历史记录策略。",
    },
    persistence: { ...ACTIVE_CONTRACT_PERSISTENCE, commitMode: "native_transition" },
    domain: {
      validatorKey: "packages/administration/server/domain/administration-contract-validation.buildContractDeleteCommand",
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
