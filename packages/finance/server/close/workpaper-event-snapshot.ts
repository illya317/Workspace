import { sha256CanonicalJson } from "./canonical-json";
import { stringArray } from "./workpaper-validation";

export type ReviewedWorkpaperSnapshotSource = {
  id: number;
  companyId: number;
  periodId: number;
  taskKey: string;
  status: string;
  conclusion: string | null;
  evidenceRefs: unknown;
  voucherRefs: unknown;
  preparedByUserId: number | null;
  reviewedByUserId: number | null;
  version: number;
};

export type ReviewedWorkpaperEventFact = {
  workpaperId: number;
  actorUserId: number;
  eventKind: string;
  toStatus: string;
  snapshot: unknown;
};

export function financeCloseReviewedWorkpaperSnapshot(workpaper: ReviewedWorkpaperSnapshotSource) {
  return {
    companyId: workpaper.companyId,
    periodId: workpaper.periodId,
    workpaperId: workpaper.id,
    version: workpaper.version,
    taskKey: workpaper.taskKey,
    status: "reviewed",
    conclusion: workpaper.conclusion,
    evidenceRefs: stringArray(workpaper.evidenceRefs),
    voucherRefs: stringArray(workpaper.voucherRefs),
    preparedByUserId: workpaper.preparedByUserId,
    reviewedByUserId: workpaper.reviewedByUserId,
  };
}

export function financeCloseReviewEventMatchesWorkpaper(
  workpaper: ReviewedWorkpaperSnapshotSource,
  event: ReviewedWorkpaperEventFact | null,
) {
  return workpaper.status === "reviewed"
    && workpaper.reviewedByUserId !== null
    && event?.workpaperId === workpaper.id
    && event.actorUserId === workpaper.reviewedByUserId
    && event.eventKind === "reviewed"
    && event.toStatus === "reviewed"
    && sha256CanonicalJson(event.snapshot) === sha256CanonicalJson(financeCloseReviewedWorkpaperSnapshot(workpaper));
}
