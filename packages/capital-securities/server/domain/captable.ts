export type CaptableInterestState = {
  recordStatus: "confirmed" | "pending";
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  shareRatio: number | null;
};

export function isOwnershipActiveAt(
  interest: Pick<CaptableInterestState, "recordStatus" | "effectiveFrom" | "effectiveTo">,
  asOf: Date,
) {
  return interest.recordStatus === "confirmed"
    && (!interest.effectiveFrom || interest.effectiveFrom <= asOf)
    && (!interest.effectiveTo || interest.effectiveTo >= asOf);
}

export function calculateCaptableMetrics(interests: readonly Pick<CaptableInterestState, "shareRatio">[]) {
  const totalShareRatio = interests.reduce((sum, interest) => sum + (interest.shareRatio ?? 0), 0);
  const differenceFromFullOwnership = 1 - totalShareRatio;
  return {
    shareholderCount: interests.length,
    totalShareRatio,
    differenceFromFullOwnership,
    isComplete: interests.every((interest) => interest.shareRatio !== null)
      && Math.abs(differenceFromFullOwnership) <= 0.000001,
  };
}
