import type { ApiMethod } from "./api-contract-types";
import type { ActionContractMetadata, ActionMutationDomainBindingReference } from "./action-contract";
import type { PermissionRegistryActionKey } from "./action-registry";
import { APPROVAL_REQUEST_STATUSES, APPROVAL_REQUEST_TRANSITIONS } from "./workflow-request-contract";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;
const FINANCE_ASSETS = { moduleKey: "finance", resourceKey: "finance.assets", originHrefPattern: "/finance/assets" } as const;
const assetRouteCommand = (name: string) => `packages/finance/server/assets/route-commands.${name}`;
const d = (validatorKey: string, commitKey: string): ActionMutationDomainBindingReference => ({ validatorKey, commitKey });

type ContractFactKey = "key" | "version" | "label" | "targetKind" | "resource" | "api" | "workflow" | "display";
type ContractOverrideKey = "api" | "workflow" | "display";
type CanonicalContractDetails = ActionContractMetadata extends infer Contract
  ? Contract extends ActionContractMetadata ? Omit<Contract, ContractFactKey> & Partial<Pick<Contract, ContractOverrideKey>> : never
  : never;
type FinanceOperationWriteKind = "create" | "update" | "delete" | "revise" | "export";
interface FinanceOperationRegistration {
  key: string; label: string; moduleKey: string; resourceKey: string; originHrefPattern: string;
  writeKind: FinanceOperationWriteKind; targetKind: string; eligibility: "permission_only" | "workflow_required";
  flowType?: "approval"; separationPolicy?: "independent_required";
  directPermissionAction?: PermissionRegistryActionKey; submitPermissionAction?: PermissionRegistryActionKey;
  processPermissionAction?: PermissionRegistryActionKey; workflowCategoryKey?: "finance";
  apiRoutes?: readonly { method: ApiMethod; path: string; notes?: string }[]; notes?: string;
}
interface FinanceAssetPermissionPolicy {
  method: ApiMethod; pathPrefix: string; requiredActions: readonly PermissionRegistryActionKey[];
  runtimeEnforcement?: "gateway" | "serviceDelegated"; pathPattern?: RegExp; notes?: string;
}

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

function contractFacts(registration: FinanceOperationRegistration) {
  const routes = (registration.apiRoutes ?? []).map((item) => `${item.method} ${item.path}`);
  return {
    key: registration.key, version: 1 as const, label: registration.label, targetKind: registration.targetKind,
    resource: {
      resourceKey: registration.resourceKey, moduleKey: registration.moduleKey,
      directPermissionAction: registration.directPermissionAction, submitPermissionAction: registration.submitPermissionAction,
      processPermissionAction: registration.processPermissionAction,
    },
    api: { commandRoute: routes[0], directRoutes: routes, envelopeVersion: 1 as const },
    workflow: { kind: "not_applicable" as const, reason: "当前注册为 permission_only；如需接入流程，必须迁移为共享 typed command adapter 后再修改该声明。" },
    display: { titleTemplate: registration.label, hrefPattern: registration.originHrefPattern },
  };
}

function defineAssetAction<const Registration extends FinanceOperationRegistration>(
  registration: Registration,
  contract: CanonicalContractDetails,
  permissionPolicies: readonly FinanceAssetPermissionPolicy[],
) {
  return { registration, contract: { ...contractFacts(registration), ...contract } as ActionContractMetadata, permissionPolicies } as const;
}

function directAssetAction<const Input extends {
  key: string; label: string; writeKind: FinanceOperationWriteKind; targetKind: string;
  permission: PermissionRegistryActionKey; route: readonly [ApiMethod, string, string?];
  contract: CanonicalContractDetails; exactPolicy?: boolean;
}>(input: Input) {
  const [method, path, notes] = input.route;
  const exactPolicy = input.exactPolicy
    ? { pathPattern: new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }
    : {};
  return defineAssetAction(
    { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: input.key, label: input.label, writeKind: input.writeKind, targetKind: input.targetKind, directPermissionAction: input.permission, apiRoutes: [route(method, path, notes)] },
    input.contract,
    [{ method, pathPrefix: path, requiredActions: [input.permission], ...exactPolicy }],
  );
}

function writeContract(
  activeEntity: string,
  domain: ActionMutationDomainBindingReference,
  options: { shape?: "full_record" | "field_patch" | "change_set"; target?: "new_record" | "existing_record" | "mixed"; commitMode?: "activate" | "copy_to_active" | "apply_patch" | "native_transition" } = {},
): CanonicalContractDetails {
  return {
    kind: "write",
    payload: { cardinality: "single", shape: options.shape ?? "field_patch", target: options.target ?? "existing_record" },
    persistence: { strategy: "active_table_state", activeEntity, supportedPersistenceModes: ["active"], defaultMode: "active", commitMode: options.commitMode ?? "apply_patch" },
    domain,
  };
}

export const FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS = [
  defineAssetAction(
    {
      ...FINANCE_ASSETS, key: "finance.assets.asset.create", label: "创建资产卡片", writeKind: "create", targetKind: "FinanceAssetCard",
      eligibility: "workflow_required", flowType: "approval", separationPolicy: "independent_required", directPermissionAction: "create",
      submitPermissionAction: "submit", processPermissionAction: "approve", workflowCategoryKey: "finance",
      apiRoutes: [route("POST", "/api/modules/finance/assets"), route("GET", "/api/modules/finance/assets/submissions"), route("POST", "/api/modules/finance/assets/submissions/:id/approve"), route("POST", "/api/modules/finance/assets/submissions/:id/reject"), route("POST", "/api/modules/finance/assets/submissions/:id/withdraw"), route("POST", "/api/modules/finance/assets/submissions/:id/cancel")],
      notes: "仅当已解析的公司年度资产分类政策要求录入前复核时启用审批；其他分类保持直接保存。",
    },
    {
      kind: "write",
      payload: { cardinality: "single", shape: "full_record", target: "new_record", notes: "申请保存完整的资产卡片快照；审批时必须重新解析公司年度分类政策、科目和业务编码。" },
      persistence: { strategy: "approval_payload", activeEntity: "FinanceAssetCard", draftEntity: "ApprovalRequest", supportedPersistenceModes: ["active", "workflowDraft"], defaultMode: "workflowDraft", commitMode: "copy_to_active", notes: "普通分类直接创建 FinanceAssetCard；需复核分类在通过前只保存 ApprovalRequest.latestPayload，不产生可用卡片。" },
      form: { adapterKey: "finance.assets.asset.create", payloadVersion: 1, supportedPersistenceModes: ["active", "workflowDraft"], supportedModes: ["direct", "workflow"], notes: "同一建卡表单根据已保存分类政策映射为保存或提交审批，不同时暴露两个持久化出口。" },
      domain: d(assetRouteCommand("buildCreateFinanceAssetCardRouteCommand"), assetRouteCommand("executeCreateFinanceAssetCardRouteCommand")),
      api: { commandRoute: "POST /api/modules/finance/assets", directRoutes: ["POST /api/modules/finance/assets"], workflowRoutes: ["POST /api/modules/finance/assets", "GET /api/modules/finance/assets/submissions", "POST /api/modules/finance/assets/submissions/:id/approve", "POST /api/modules/finance/assets/submissions/:id/reject", "POST /api/modules/finance/assets/submissions/:id/withdraw", "POST /api/modules/finance/assets/submissions/:id/cancel"], envelopeVersion: 1 },
      workflow: {
        kind: "configurable", defaultExecutionMode: "workflow", canDisable: false, whenDisabled: "direct_write", entrySemantics: "form_finalization",
        statuses: APPROVAL_REQUEST_STATUSES, transitions: APPROVAL_REQUEST_TRANSITIONS,
        mutationPolicy: { handlerCanRevise: false, requestCanWithdraw: true, requestCanRevise: false, requestCanCancel: true, requestCanResubmit: false },
        routing: { handlerSource: "permission", separationPolicy: "independent_required", approvalMode: "any_one" },
        defaultDefinition: { version: 1, nodes: [{ key: "finance-asset-card-create-approval", label: "资产建卡审批", kind: "approval", assignee: { kind: "permission_holders", resourceKey: "finance.assets", action: "approve" }, approvalMode: "any_one", separationPolicy: "independent_required", bypassable: false }] },
        configuration: { nodeKinds: ["approval"], assigneeKinds: ["permission_holders"], approvalModes: ["any_one"], separationPolicies: ["independent_required"], allowNodeAddRemove: false, allowBypassConditions: false, maxNodes: 1 },
        validateOn: ["draft", "submit", "commit"],
        notes: "仅 reviewRequired=true 的已解析分类进入此流程；不允许发起人处理自己的建卡申请。whenDisabled=direct_write 只用于 reviewRequired=false 的不适用分支，政策本身 canDisable=false。",
      },
      display: { titleTemplate: "资产建卡：{name}", summaryTemplate: "{companyCode} · {name}", hrefPattern: "/finance/assets?view=cards&approvalId={requestId}" },
    },
    [
      { method: "POST", pathPrefix: "/api/modules/finance/assets", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/assets$/, notes: "Asset create resolves the saved category policy first: direct categories require create while review-required categories require submit and are committed only by the approval adapter." },
      { method: "GET", pathPrefix: "/api/modules/finance/assets/submissions", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Asset-card approval visibility and object access are enforced by the Finance asset approval adapter." },
      { method: "POST", pathPrefix: "/api/modules/finance/assets/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/assets\/submissions\/[^/]+\/approve$/, notes: "Asset-card approval is restricted to the request's independent Finance asset approvers." },
      { method: "POST", pathPrefix: "/api/modules/finance/assets/submissions", requiredActions: ["reject"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/assets\/submissions\/[^/]+\/reject$/, notes: "Asset-card rejection is restricted to the request's independent Finance asset approvers." },
      { method: "POST", pathPrefix: "/api/modules/finance/assets/submissions", requiredActions: ["reverse"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/assets\/submissions\/[^/]+\/(?:withdraw|cancel)$/, notes: "Asset-card workflow withdrawal and cancellation are restricted to the submitter by the Finance asset approval adapter." },
    ],
  ),
  directAssetAction({ key: "finance.assets.asset.update", label: "更新资产卡片", writeKind: "update", targetKind: "FinanceAssetCard", permission: "update", route: ["PUT", "/api/modules/finance/assets"], exactPolicy: true, contract: writeContract("FinanceAssetCard", d(assetRouteCommand("buildUpdateFinanceAssetCardRouteCommand"), assetRouteCommand("executeUpdateFinanceAssetCardRouteCommand"))) }),
  directAssetAction({ key: "finance.assets.categoryPolicy.update", label: "更新资产会计政策", writeKind: "update", targetKind: "FinanceAssetCategoryPolicy", permission: "update", route: ["PUT", "/api/modules/finance/assets/policies"], contract: writeContract("FinanceAssetCategoryPolicy", d(assetRouteCommand("buildUpdateFinanceAssetCategoryPolicyRouteCommand"), assetRouteCommand("executeUpdateFinanceAssetCategoryPolicyRouteCommand"))) }),
  directAssetAction({ key: "finance.assets.categoryPolicy.delete", label: "删除资产会计政策覆盖", writeKind: "delete", targetKind: "FinanceAssetCategoryPolicy", permission: "update", route: ["DELETE", "/api/modules/finance/assets/policies"], contract: { kind: "lifecycle", payload: { cardinality: "single", shape: "field_patch", target: "existing_record", targetIdKey: "categoryId", versionKey: "version" }, lifecycle: { operation: "delete", targetIdKey: "categoryId", versionKey: "version", deleteMode: "hard", referencePolicy: "domain", auditPolicy: "none" }, persistence: { strategy: "active_table_state", activeEntity: "FinanceAssetCategoryPolicy", supportedPersistenceModes: ["active"], defaultMode: "active", commitMode: "native_transition" }, domain: d(assetRouteCommand("buildDeleteFinanceAssetCategoryPolicyRouteCommand"), assetRouteCommand("executeDeleteFinanceAssetCategoryPolicyRouteCommand")) } }),
  directAssetAction({ key: "finance.assets.assetPeriod.recalculate", label: "重算折旧摊销期间", writeKind: "revise", targetKind: "FinanceAssetPeriodEntry", permission: "revise", route: ["POST", "/api/modules/finance/assets/periods/recalculate"], contract: writeContract("FinanceAssetPeriodEntry", d(assetRouteCommand("buildRecalculateFinanceAssetPeriodRouteCommand"), assetRouteCommand("executeRecalculateFinanceAssetPeriodCommand")), { shape: "change_set", target: "mixed", commitMode: "native_transition" }) }),
  directAssetAction({ key: "finance.assets.assetPeriod.linkVoucher", label: "关联折旧摊销凭证", writeKind: "revise", targetKind: "FinanceAssetPeriodEntry", permission: "revise", route: ["PUT", "/api/modules/finance/assets/periods/voucher-link"], contract: writeContract("FinanceAssetPeriodEntry", d(assetRouteCommand("buildLinkFinanceAssetPeriodVoucherRouteCommand"), assetRouteCommand("executeLinkFinanceAssetPeriodVoucherRouteCommand")), { shape: "change_set", target: "mixed", commitMode: "native_transition" }) }),
  directAssetAction({ key: "finance.assets.acquisitionEvidence.confirm", label: "确认资产取得证据", writeKind: "revise", targetKind: "FinanceAssetAcquisitionEvidence", permission: "revise", route: ["POST", "/api/modules/finance/assets/acquisition-evidence"], contract: writeContract("FinanceAssetAcquisitionEvidence", d(assetRouteCommand("buildConfirmFinanceAssetAcquisitionEvidenceRouteCommand"), assetRouteCommand("executeConfirmFinanceAssetAcquisitionEvidenceRouteCommand")), { shape: "full_record", target: "new_record", commitMode: "native_transition" }) }),
  directAssetAction({ key: "finance.assets.impairmentAssessment.confirm", label: "确认资产减值评估", writeKind: "revise", targetKind: "FinanceAssetImpairmentAssessment", permission: "revise", route: ["PUT", "/api/modules/finance/assets/impairment-assessment"], contract: writeContract("FinanceAssetImpairmentAssessment", d(assetRouteCommand("buildConfirmFinanceAssetImpairmentAssessmentRouteCommand"), assetRouteCommand("executeConfirmFinanceAssetImpairmentAssessmentRouteCommand")), { shape: "full_record", target: "mixed", commitMode: "native_transition" }) }),
  directAssetAction({ key: "finance.assets.disposal.confirm", label: "确认资产处置", writeKind: "revise", targetKind: "FinanceAssetDisposal", permission: "revise", route: ["POST", "/api/modules/finance/assets/disposals"], contract: writeContract("FinanceAssetDisposal", d(assetRouteCommand("buildConfirmFinanceAssetDisposalRouteCommand"), assetRouteCommand("executeConfirmFinanceAssetDisposalRouteCommand")), { shape: "full_record", target: "new_record", commitMode: "native_transition" }) }),
  directAssetAction({ key: "finance.assets.workspace.export", label: "下载资产会计 Excel", writeKind: "export", targetKind: "FinanceAssetWorkbook", permission: "export", route: ["GET", "/api/modules/finance/assets/export", "GET export is permission-only and generates no business record."], exactPolicy: true, contract: { kind: "exchange", payload: { cardinality: "batch", shape: "full_record", target: "mixed", notes: "按资产会计当前公司、期间、视图和关键词筛选导出全部匹配行。" }, exchange: { direction: "export", transport: "file", result: "file", contentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] }, domain: { bindings: [{ validatorKey: "packages/finance/server/assets/export-route-commands.buildFinanceAssetExportCommand", executeKey: "packages/finance/server/assets/export-route-commands.executeFinanceAssetExportCommand" }] } } }),
] as const;

export const FINANCE_ASSET_ACTION_CONTRACT_METADATA = FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS.map((definition) => definition.contract);
export const FINANCE_ASSET_PERMISSION_API_ACTION_POLICIES = FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS.flatMap((definition) => definition.permissionPolicies);
export const FINANCE_ASSET_BUSINESS_ACTION_REGISTRATIONS = FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS.map((definition) => definition.registration);
