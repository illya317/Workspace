import type { InventoryClosingContract, InventoryClosingInspection } from "@workspace/platform/contracts/inventory-closing";
import type { FinanceCloseProvider, FinanceCloseProviderInspection } from "../../types/close";
import { financeCloseInspectionFingerprint } from "./inspection-identity";

function toFinanceInspection(value: InventoryClosingInspection): FinanceCloseProviderInspection {
  const identity = {
    status: value.status, blockers: value.blockers, evidenceRefs: value.evidenceRefs,
    voucherRefs: value.voucherRefs, deepLink: value.deepLink, payload: value.payload,
  };
  return {
    status: value.status,
    contributorVersion: value.inspectionVersion,
    inputFingerprint: financeCloseInspectionFingerprint(identity),
    blockers: value.blockers,
    evidenceRefs: value.evidenceRefs,
    voucherRefs: value.voucherRefs,
    deepLink: value.deepLink,
    payload: value.payload,
  };
}

const missingInventoryClosingContract: InventoryClosingContract = {
  inspectPeriodRecords: async () => { throw new Error("Inventory closing contract was not injected"); },
  inspectPeriodCountDifferences: async () => { throw new Error("Inventory closing contract was not injected"); },
};

export function buildInventoryCloseProviders(contract?: InventoryClosingContract): Record<string, FinanceCloseProvider> {
  const runtime = contract ?? missingInventoryClosingContract;
  return {
    "inventory.operations.records": {
      inspectPeriodClose: async (scope) => toFinanceInspection(await runtime.inspectPeriodRecords(scope)),
    },
    "inventory.operations.count-differences": {
      inspectPeriodClose: async (scope) => toFinanceInspection(await runtime.inspectPeriodCountDifferences(scope)),
    },
  };
}
