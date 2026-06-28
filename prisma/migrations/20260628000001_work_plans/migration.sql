CREATE TABLE "WorkPlan" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetType" TEXT NOT NULL DEFAULT 'personal',
  "targetId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'okr',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "ownerEmployeeId" INTEGER,
  "periodType" TEXT,
  "periodStart" DATETIME,
  "periodEnd" DATETIME,
  "sourceType" TEXT NOT NULL DEFAULT 'other',
  "sourceKind" TEXT,
  "sourceMeetingId" INTEGER,
  "sourceMeetingDecisionId" INTEGER,
  "sourceMeetingActionCandidateId" INTEGER,
  "linkedProjectId" INTEGER,
  "linkedProjectPhaseId" INTEGER,
  "linkedProjectTaskId" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlan_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_linkedProjectPhaseId_fkey" FOREIGN KEY ("linkedProjectPhaseId") REFERENCES "ProjectPlanPhase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_linkedProjectTaskId_fkey" FOREIGN KEY ("linkedProjectTaskId") REFERENCES "ProjectTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourceMeetingDecisionId_fkey" FOREIGN KEY ("sourceMeetingDecisionId") REFERENCES "MeetingDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourceMeetingActionCandidateId_fkey" FOREIGN KEY ("sourceMeetingActionCandidateId") REFERENCES "MeetingActionCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "WorkItem" ADD COLUMN "planId" INTEGER REFERENCES "WorkPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "WorkPlan_targetType_targetId_kind_status_idx" ON "WorkPlan"("targetType", "targetId", "kind", "status");
CREATE INDEX "WorkPlan_targetType_targetId_periodType_periodStart_idx" ON "WorkPlan"("targetType", "targetId", "periodType", "periodStart");
CREATE INDEX "WorkPlan_sourceType_linkedProjectId_linkedProjectTaskId_idx" ON "WorkPlan"("sourceType", "linkedProjectId", "linkedProjectTaskId");
CREATE INDEX "WorkPlan_ownerEmployeeId_idx" ON "WorkPlan"("ownerEmployeeId");
CREATE INDEX "WorkPlan_linkedProjectId_idx" ON "WorkPlan"("linkedProjectId");
CREATE INDEX "WorkPlan_linkedProjectPhaseId_idx" ON "WorkPlan"("linkedProjectPhaseId");
CREATE INDEX "WorkPlan_linkedProjectTaskId_idx" ON "WorkPlan"("linkedProjectTaskId");
CREATE INDEX "WorkPlan_sourceMeetingId_idx" ON "WorkPlan"("sourceMeetingId");
CREATE INDEX "WorkPlan_sourceMeetingDecisionId_idx" ON "WorkPlan"("sourceMeetingDecisionId");
CREATE INDEX "WorkPlan_sourceMeetingActionCandidateId_idx" ON "WorkPlan"("sourceMeetingActionCandidateId");
CREATE INDEX "WorkItem_planId_parentWorkItemId_itemType_idx" ON "WorkItem"("planId", "parentWorkItemId", "itemType");
CREATE INDEX "WorkItem_planId_itemType_isArchived_idx" ON "WorkItem"("planId", "itemType", "isArchived");
