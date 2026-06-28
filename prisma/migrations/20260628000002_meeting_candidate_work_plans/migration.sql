ALTER TABLE "MeetingActionCandidate" ADD COLUMN "linkedWorkPlanId" INTEGER;

CREATE INDEX "MeetingActionCandidate_linkedWorkPlanId_idx" ON "MeetingActionCandidate"("linkedWorkPlanId");

ALTER TABLE "MeetingActionCandidate"
  ADD CONSTRAINT "MeetingActionCandidate_linkedWorkPlanId_fkey"
  FOREIGN KEY ("linkedWorkPlanId") REFERENCES "WorkPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
