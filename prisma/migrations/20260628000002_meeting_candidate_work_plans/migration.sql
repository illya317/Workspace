ALTER TABLE "MeetingActionCandidate" ADD COLUMN "linkedWorkPlanId" INTEGER REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MeetingActionCandidate_linkedWorkPlanId_idx" ON "MeetingActionCandidate"("linkedWorkPlanId");
