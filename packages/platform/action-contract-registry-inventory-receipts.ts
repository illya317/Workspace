import { defineActionContractMetadataList } from "./action-contract";
import { registeredActionFacts, registeredLifecycle, registeredWrite } from "./action-contract-registry-helpers";

const domain = (validatorKey: string, commitKey: string) => ({ validatorKey, commitKey });

const nativeMutation = {
  handlerCanRevise: false,
  requestCanWithdraw: false,
  requestCanRevise: false,
  requestCanCancel: false,
  requestCanResubmit: false,
} as const;

const nativeConfiguration = {
  nodeKinds: ["review"],
  assigneeKinds: ["permission_holders"],
  approvalModes: ["any_one"],
  separationPolicies: ["independent_required"],
  allowNodeAddRemove: false,
  allowBypassConditions: false,
  maxNodes: 1,
} as const;

function reportWorkflow(key: "inventory.receipts.report.confirm" | "inventory.receipts.report.review", validatorKey: string, commitKey: string) {
  const facts = registeredActionFacts(key);
  return {
    ...facts,
    kind: "workflow" as const,
    payload: { cardinality: "single" as const, shape: "field_patch" as const, target: "existing_record" as const, targetIdKey: "reportId", versionKey: "expectedVersion" },
    persistence: { strategy: "active_table_state" as const, activeEntity: "InventoryReceiptReport", supportedPersistenceModes: ["active" as const], defaultMode: "active" as const, commitMode: "native_transition" as const },
    domain: domain(validatorKey, commitKey),
    api: {
      ...facts.api,
      workflowRoutes: ["POST /api/modules/inventory/receipts/reports/:reportId/review"],
    },
    workflow: {
      kind: "native" as const,
      defaultExecutionMode: "native" as const,
      canDisable: false,
      whenDisabled: "unavailable" as const,
      entrySemantics: "domain_transition" as const,
      statuses: ["draft", "submitted", "approved"] as const,
      transitions: ["submit", "approve"] as const,
      mutationPolicy: nativeMutation,
      routing: { handlerSource: "permission" as const, separationPolicy: "independent_required" as const, approvalMode: "any_one" as const },
      defaultDefinition: { version: 1 as const, nodes: [{ key: "inventory-receipts-finance-review", label: "财务复核成品入库报单", kind: "review" as const, assignee: { kind: "permission_holders" as const, resourceKey: "inventory.receipts", action: "approve" }, approvalMode: "any_one" as const, separationPolicy: "independent_required" as const, bypassable: false }] },
      configuration: nativeConfiguration,
      validateOn: ["submit" as const, "commit" as const],
      notes: "车间确认月度汇总后锁定数据，由持有 inventory.receipts.approve 的财务人员独立复核；不创建 ApprovalRequest。",
    },
    display: { titleTemplate: "成品入库报单月度汇总", summaryTemplate: "{year}年{month}月", hrefPattern: "/inventory/receipts" },
  };
}

export const INVENTORY_RECEIPT_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  registeredWrite({
    key: "inventory.receipts.record.create",
    activeEntity: "InventoryReceiptOutput",
    shape: "full_record",
    target: "new_record",
    commitMode: "activate",
    domain: domain("packages/inventory/server/domain/inventory-receipts-validation.buildReceiptCreateCommand", "packages/inventory/server/receipts/service.commitCreateReceiptCommand"),
  }),
  registeredWrite({
    key: "inventory.receipts.record.update",
    activeEntity: "InventoryReceiptOutput",
    shape: "full_record",
    target: "existing_record",
    targetIdKey: "id",
    domain: domain("packages/inventory/server/domain/inventory-receipts-validation.buildReceiptUpdateCommand", "packages/inventory/server/receipts/service.commitUpdateReceiptCommand"),
  }),
  registeredLifecycle({
    key: "inventory.receipts.record.delete",
    activeEntity: "InventoryReceiptOutput",
    operation: "delete",
    targetIdKey: "id",
    versionKey: "expectedVersion",
    deleteMode: "hard",
    referencePolicy: "none",
    auditPolicy: "none",
    domain: domain("packages/inventory/server/domain/inventory-receipts-validation.buildReceiptDeleteCommand", "packages/inventory/server/receipts/service.commitDeleteReceiptCommand"),
  }),
  reportWorkflow(
    "inventory.receipts.report.confirm",
    "packages/inventory/server/domain/inventory-receipts-validation.buildReceiptReportConfirmCommand",
    "packages/inventory/server/receipts/report-lifecycle.commitReceiptReportConfirmCommand",
  ),
  reportWorkflow(
    "inventory.receipts.report.review",
    "packages/inventory/server/domain/inventory-receipts-validation.buildReceiptReportReviewCommand",
    "packages/inventory/server/receipts/report-lifecycle.commitReceiptReportReviewCommand",
  ),
]);
