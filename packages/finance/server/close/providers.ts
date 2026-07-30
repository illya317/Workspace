import type { FinanceCloseBlockerDto, FinanceCloseProvider, FinanceCloseProviderInspection, FinanceCloseScope } from "../../types/close";
import { FINANCE_CLOSE_TASK_CATALOG } from "./catalog";
import { canonicalJson, sha256CanonicalJson } from "./canonical-json";
import { financeCloseInspectionFingerprint } from "./inspection-identity";

export type FinanceCloseProviderRegistry = ReadonlyMap<string, FinanceCloseProvider>;

export function buildFinanceCloseProviderRegistry(providers: Record<string, FinanceCloseProvider>): FinanceCloseProviderRegistry {
  return new Map(Object.entries(providers));
}

function unavailable(scope: FinanceCloseScope, contributorKey: string, deepLink: string, code = "provider_unavailable"): FinanceCloseProviderInspection {
  const payload = { contributorKey, reason: code, scope };
  const blockers = [{ code, message: `${contributorKey} 关账检查暂不可用`, deepLink }];
  return {
    status: "unavailable", contributorVersion: "unavailable-v1",
    inputFingerprint: financeCloseInspectionFingerprint({ status: "unavailable", blockers, evidenceRefs: [], voucherRefs: [], deepLink, payload }),
    blockers, evidenceRefs: [], voucherRefs: [], deepLink, payload,
  };
}

function validInspection(value: FinanceCloseProviderInspection) {
  if (!value || typeof value !== "object") throw new Error("invalid inspection");
  if (!(["pending", "ready", "blocked", "unavailable"] as const).includes(value.status)) throw new Error("invalid inspection status");
  if (!Array.isArray(value.blockers) || value.blockers.some((item) => (
    !item || typeof item !== "object" || typeof item.code !== "string" || !item.code.trim()
    || typeof item.message !== "string" || !item.message.trim()
    || typeof item.deepLink !== "string" || !item.deepLink.trim()
  ))) throw new Error("invalid inspection blockers");
  if (value.status === "ready" && value.blockers.length > 0) throw new Error("ready inspection cannot contain blockers");
  if ((value.status === "blocked" || value.status === "unavailable") && value.blockers.length === 0) {
    throw new Error(`${value.status} inspection must contain a blocker`);
  }
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((item) => typeof item !== "string")) throw new Error("invalid evidence refs");
  if (!Array.isArray(value.voucherRefs) || value.voucherRefs.some((item) => typeof item !== "string")) throw new Error("invalid voucher refs");
  canonicalJson(value.payload);
  if (typeof value.contributorVersion !== "string" || !value.contributorVersion.trim()
    || typeof value.inputFingerprint !== "string" || !value.inputFingerprint.trim()
    || typeof value.deepLink !== "string" || !value.deepLink.trim()) throw new Error("invalid inspection identity");
  return { ...value, inputFingerprint: financeCloseInspectionFingerprint(value) };
}

export async function inspectFinanceCloseContributors(scope: FinanceCloseScope, registry: FinanceCloseProviderRegistry) {
  const unique = new Map(FINANCE_CLOSE_TASK_CATALOG.map((item) => [item.contributorKey, item.deepLink]));
  const results = new Map<string, FinanceCloseProviderInspection>();
  for (const [contributorKey, deepLink] of unique) {
    const provider = registry.get(contributorKey);
    if (!provider) {
      results.set(contributorKey, unavailable(scope, contributorKey, deepLink, "provider_not_registered"));
      continue;
    }
    try {
      results.set(contributorKey, validInspection(await provider.inspectPeriodClose(scope)));
    } catch {
      results.set(contributorKey, unavailable(scope, contributorKey, deepLink));
    }
  }
  return results;
}

export type FinanceCloseRefreshPlanItem = {
  taskKey: string;
  inspection: FinanceCloseProviderInspection;
  snapshotPayload: {
    status: FinanceCloseProviderInspection["status"];
    blockers: FinanceCloseBlockerDto[];
    evidenceRefs: string[];
    voucherRefs: string[];
    deepLink: string;
    payload: unknown;
  };
  payloadSha256: string;
};

export function planFinanceCloseRefresh(inspections: ReadonlyMap<string, FinanceCloseProviderInspection>): FinanceCloseRefreshPlanItem[] {
  return FINANCE_CLOSE_TASK_CATALOG.map((task) => {
    const inspection = inspections.get(task.contributorKey);
    if (!inspection) throw new Error(`Missing inspection for ${task.contributorKey}`);
    const snapshotPayload = {
      status: inspection.status, blockers: inspection.blockers, evidenceRefs: inspection.evidenceRefs,
      voucherRefs: inspection.voucherRefs, deepLink: inspection.deepLink, payload: inspection.payload,
    };
    const payloadSha256 = sha256CanonicalJson(snapshotPayload);
    return {
      taskKey: task.taskKey,
      inspection: { ...inspection, inputFingerprint: payloadSha256 },
      snapshotPayload,
      payloadSha256,
    };
  });
}
