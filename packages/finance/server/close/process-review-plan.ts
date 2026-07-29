import type { FinanceCloseProviderInspection } from "../../types/close";
import { sha256CanonicalJson } from "./canonical-json";
import type { FinanceCloseRefreshPlanItem } from "./providers";

/**
 * 二阶段派生最终流程复核：provider 只证明独立复核底稿；本函数再消费同次刷新前 26 项，
 * 从而不递归调用 contributor registry，也不会读取上一次运行的陈旧任务投影。
 */
export function deriveCloseProcessReviewPlan(plan: FinanceCloseRefreshPlanItem[]) {
  const reviewIndex = plan.findIndex((item) => item.taskKey === "close-process-review");
  if (reviewIndex < 0) return plan;
  const review = plan[reviewIndex]!;
  const dependencies = plan.filter((_, index) => index !== reviewIndex);
  const blocked = dependencies.filter((item) => item.inspection.status === "blocked" || item.inspection.status === "unavailable");
  const pending = dependencies.filter((item) => item.inspection.status === "pending");
  const dependencyStatus = blocked.length ? "blocked" : pending.length ? "pending" : "ready";
  const status = review.inspection.status === "blocked" || review.inspection.status === "unavailable"
    ? review.inspection.status
    : review.inspection.status !== "ready" ? "pending" : dependencyStatus;
  const blockers = [
    ...review.inspection.blockers,
    ...(blocked.length ? [{
      code: "close_dependencies_blocked",
      message: `${blocked.length} 项前置关账任务仍阻断或不可用`,
      deepLink: review.inspection.deepLink,
    }] : []),
  ];
  const payload = {
    review: review.inspection.payload,
    dependencies: dependencies.map((item) => ({ taskKey: item.taskKey, status: item.inspection.status, inputFingerprint: item.inspection.inputFingerprint })),
  };
  const inspectionWithoutIdentity: FinanceCloseProviderInspection = {
    ...review.inspection,
    status,
    blockers,
    payload,
  };
  const snapshotPayload = {
    status, blockers, evidenceRefs: inspectionWithoutIdentity.evidenceRefs, voucherRefs: inspectionWithoutIdentity.voucherRefs,
    deepLink: inspectionWithoutIdentity.deepLink, payload,
  };
  const payloadSha256 = sha256CanonicalJson(snapshotPayload);
  const inspection = { ...inspectionWithoutIdentity, inputFingerprint: payloadSha256 };
  const derived = {
    ...review,
    inspection,
    snapshotPayload,
    payloadSha256,
  };
  return plan.map((item, index) => index === reviewIndex ? derived : item);
}
