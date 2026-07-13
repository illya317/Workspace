PRAGMA foreign_keys=OFF;

DELETE FROM "ProjectPlanDependency" WHERE "predecessorKind" = 'task' OR "successorKind" = 'task';
DELETE FROM "ProjectPlanBaselineItem" WHERE "itemKind" = 'task' OR "parentKind" = 'task';

DROP INDEX IF EXISTS "Project_code_key";
DROP INDEX IF EXISTS "Project_leadingDepartmentId_idx";
DROP INDEX IF EXISTS "Project_owningDepartmentId_idx";
DROP INDEX IF EXISTS "Project_workspaceEnabled_idx";
DROP INDEX IF EXISTS "Project_projectType_idx";
DROP INDEX IF EXISTS "Project_parentProjectTaskId_key";
DROP INDEX IF EXISTS "Project_parentProjectTaskId_idx";

ALTER TABLE "Project" RENAME TO "old_Project";
CREATE TABLE "Project" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "projectType" TEXT NOT NULL DEFAULT 'department',
  "projectLevel" TEXT NOT NULL DEFAULT '普通',
  "plan" TEXT,
  "goal" TEXT,
  "milestones" TEXT,
  "budgetAmount" REAL,
  "budgetNote" TEXT,
  "riskNote" TEXT,
  "remark" TEXT,
  "baselineStartDate" DATETIME,
  "baselineEndDate" DATETIME,
  "startDate" DATETIME,
  "endDate" DATETIME,
  "completionPercent" REAL,
  "closureType" TEXT,
  "leadingDepartmentId" INTEGER,
  "owningDepartmentId" INTEGER,
  "workspaceEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" DATETIME,
  "createdBy" INTEGER,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_leadingDepartmentId_fkey" FOREIGN KEY ("leadingDepartmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Project_owningDepartmentId_fkey" FOREIGN KEY ("owningDepartmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "Project" ("id", "code", "name", "description", "projectType", "projectLevel", "plan", "goal", "milestones", "budgetAmount", "budgetNote", "riskNote", "remark", "baselineStartDate", "baselineEndDate", "startDate", "endDate", "completionPercent", "closureType", "leadingDepartmentId", "owningDepartmentId", "workspaceEnabled", "isArchived", "archivedAt", "createdBy", "editedBy", "editedAt", "version", "createdAt", "updatedAt")
SELECT "id", "code", "name", "description", "projectType", "projectLevel", "plan", "goal", "milestones", "budgetAmount", "budgetNote", "riskNote", "remark", "baselineStartDate", "baselineEndDate", "startDate", "endDate", "completionPercent", "closureType", "leadingDepartmentId", "owningDepartmentId", "workspaceEnabled", "isArchived", "archivedAt", "createdBy", "editedBy", "editedAt", "version", "createdAt", "updatedAt" FROM "old_Project";
DROP TABLE "old_Project";
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");
CREATE INDEX "Project_leadingDepartmentId_idx" ON "Project"("leadingDepartmentId");
CREATE INDEX "Project_owningDepartmentId_idx" ON "Project"("owningDepartmentId");
CREATE INDEX "Project_workspaceEnabled_idx" ON "Project"("workspaceEnabled");
CREATE INDEX "Project_projectType_idx" ON "Project"("projectType");

DROP INDEX IF EXISTS "WorkPlan_targetType_targetId_kind_status_idx";
DROP INDEX IF EXISTS "WorkPlan_targetType_targetId_okrStage_idx";
DROP INDEX IF EXISTS "WorkPlan_krReviewOpensAt_okrStage_idx";
DROP INDEX IF EXISTS "WorkPlan_targetType_targetId_periodType_periodStart_idx";
DROP INDEX IF EXISTS "WorkPlan_okrCycleId_idx";
DROP INDEX IF EXISTS "WorkPlan_sourcePlanId_idx";
DROP INDEX IF EXISTS "WorkPlan_okrControlScopeType_okrControlScopeId_idx";
DROP INDEX IF EXISTS "WorkPlan_sourceType_linkedProjectId_linkedProjectTaskId_idx";
DROP INDEX IF EXISTS "WorkPlan_sourceType_linkedProjectId_linkedProjectPhaseId_idx";
DROP INDEX IF EXISTS "WorkPlan_ownerEmployeeId_idx";
DROP INDEX IF EXISTS "WorkPlan_linkedProjectId_idx";
DROP INDEX IF EXISTS "WorkPlan_linkedProjectPhaseId_idx";
DROP INDEX IF EXISTS "WorkPlan_linkedProjectTaskId_idx";
DROP INDEX IF EXISTS "WorkPlan_sourceMeetingId_idx";
DROP INDEX IF EXISTS "WorkPlan_sourceMeetingDecisionId_idx";
DROP INDEX IF EXISTS "WorkPlan_sourceMeetingActionCandidateId_idx";
DROP INDEX IF EXISTS "WorkPlan_sourceDepartmentId_idx";

ALTER TABLE "WorkPlan" RENAME TO "old_WorkPlan";
CREATE TABLE "WorkPlan" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetType" TEXT NOT NULL DEFAULT 'personal',
  "targetId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'okr',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "okrStage" TEXT NOT NULL DEFAULT 'objective_draft',
  "objectiveSubmittedAt" DATETIME,
  "objectiveApprovedAt" DATETIME,
  "objectiveApprovedByUserId" INTEGER,
  "krReviewOpensAt" DATETIME,
  "krSubmittedAt" DATETIME,
  "krApprovedAt" DATETIME,
  "krApprovedByUserId" INTEGER,
  "ownerEmployeeId" INTEGER,
  "okrCycleId" INTEGER,
  "sourcePlanId" INTEGER,
  "okrControlScopeType" TEXT,
  "okrControlScopeId" TEXT,
  "objectiveApprovalSnapshotJson" TEXT NOT NULL DEFAULT '{}',
  "krApprovalSnapshotJson" TEXT NOT NULL DEFAULT '{}',
  "periodType" TEXT,
  "periodStart" DATETIME,
  "periodEnd" DATETIME,
  "sourceType" TEXT NOT NULL DEFAULT 'other',
  "sourceKind" TEXT,
  "sourceMeetingId" INTEGER,
  "sourceMeetingDecisionId" INTEGER,
  "sourceMeetingActionCandidateId" INTEGER,
  "sourceDepartmentId" INTEGER,
  "linkedProjectId" INTEGER,
  "linkedProjectPhaseId" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlan_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_okrCycleId_fkey" FOREIGN KEY ("okrCycleId") REFERENCES "WorkOkrCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "WorkPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_linkedProjectPhaseId_fkey" FOREIGN KEY ("linkedProjectPhaseId") REFERENCES "ProjectPlanPhase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourceMeetingDecisionId_fkey" FOREIGN KEY ("sourceMeetingDecisionId") REFERENCES "MeetingDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourceMeetingActionCandidateId_fkey" FOREIGN KEY ("sourceMeetingActionCandidateId") REFERENCES "MeetingActionCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlan_sourceDepartmentId_fkey" FOREIGN KEY ("sourceDepartmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "WorkPlan" ("id", "targetType", "targetId", "kind", "title", "description", "status", "okrStage", "objectiveSubmittedAt", "objectiveApprovedAt", "objectiveApprovedByUserId", "krReviewOpensAt", "krSubmittedAt", "krApprovedAt", "krApprovedByUserId", "ownerEmployeeId", "okrCycleId", "sourcePlanId", "okrControlScopeType", "okrControlScopeId", "objectiveApprovalSnapshotJson", "krApprovalSnapshotJson", "periodType", "periodStart", "periodEnd", "sourceType", "sourceKind", "sourceMeetingId", "sourceMeetingDecisionId", "sourceMeetingActionCandidateId", "sourceDepartmentId", "linkedProjectId", "linkedProjectPhaseId", "sortOrder", "createdAt", "updatedAt")
SELECT "id", "targetType", "targetId", "kind", "title", "description", "status", "okrStage", "objectiveSubmittedAt", "objectiveApprovedAt", "objectiveApprovedByUserId", "krReviewOpensAt", "krSubmittedAt", "krApprovedAt", "krApprovedByUserId", "ownerEmployeeId", "okrCycleId", "sourcePlanId", "okrControlScopeType", "okrControlScopeId", "objectiveApprovalSnapshotJson", "krApprovalSnapshotJson", "periodType", "periodStart", "periodEnd", "sourceType", CASE WHEN "sourceKind" = 'project_task' THEN 'project' ELSE "sourceKind" END, "sourceMeetingId", "sourceMeetingDecisionId", "sourceMeetingActionCandidateId", "sourceDepartmentId", "linkedProjectId", "linkedProjectPhaseId", "sortOrder", "createdAt", "updatedAt" FROM "old_WorkPlan";
DROP TABLE "old_WorkPlan";
CREATE INDEX "WorkPlan_targetType_targetId_kind_status_idx" ON "WorkPlan"("targetType", "targetId", "kind", "status");
CREATE INDEX "WorkPlan_targetType_targetId_okrStage_idx" ON "WorkPlan"("targetType", "targetId", "okrStage");
CREATE INDEX "WorkPlan_krReviewOpensAt_okrStage_idx" ON "WorkPlan"("krReviewOpensAt", "okrStage");
CREATE INDEX "WorkPlan_targetType_targetId_periodType_periodStart_idx" ON "WorkPlan"("targetType", "targetId", "periodType", "periodStart");
CREATE INDEX "WorkPlan_okrCycleId_idx" ON "WorkPlan"("okrCycleId");
CREATE INDEX "WorkPlan_sourcePlanId_idx" ON "WorkPlan"("sourcePlanId");
CREATE INDEX "WorkPlan_okrControlScopeType_okrControlScopeId_idx" ON "WorkPlan"("okrControlScopeType", "okrControlScopeId");
CREATE INDEX "WorkPlan_sourceType_linkedProjectId_linkedProjectPhaseId_idx" ON "WorkPlan"("sourceType", "linkedProjectId", "linkedProjectPhaseId");
CREATE INDEX "WorkPlan_ownerEmployeeId_idx" ON "WorkPlan"("ownerEmployeeId");
CREATE INDEX "WorkPlan_linkedProjectId_idx" ON "WorkPlan"("linkedProjectId");
CREATE INDEX "WorkPlan_linkedProjectPhaseId_idx" ON "WorkPlan"("linkedProjectPhaseId");
CREATE INDEX "WorkPlan_sourceMeetingId_idx" ON "WorkPlan"("sourceMeetingId");
CREATE INDEX "WorkPlan_sourceMeetingDecisionId_idx" ON "WorkPlan"("sourceMeetingDecisionId");
CREATE INDEX "WorkPlan_sourceMeetingActionCandidateId_idx" ON "WorkPlan"("sourceMeetingActionCandidateId");
CREATE INDEX "WorkPlan_sourceDepartmentId_idx" ON "WorkPlan"("sourceDepartmentId");

DROP INDEX IF EXISTS "WorkItem_planId_parentWorkItemId_itemType_idx";
DROP INDEX IF EXISTS "WorkItem_planId_itemType_isArchived_idx";
DROP INDEX IF EXISTS "WorkItem_targetType_targetId_category_idx";
DROP INDEX IF EXISTS "WorkItem_targetType_targetId_periodType_periodStart_idx";
DROP INDEX IF EXISTS "WorkItem_targetType_targetId_parentWorkItemId_itemType_idx";
DROP INDEX IF EXISTS "WorkItem_targetType_targetId_itemType_isArchived_idx";
DROP INDEX IF EXISTS "WorkItem_sourceType_linkedProjectId_linkedProjectTaskId_idx";
DROP INDEX IF EXISTS "WorkItem_sourceType_linkedProjectId_linkedProjectPhaseId_idx";
DROP INDEX IF EXISTS "WorkItem_ownerEmployeeId_idx";
DROP INDEX IF EXISTS "WorkItem_status_idx";
DROP INDEX IF EXISTS "WorkItem_linkedProjectId_idx";
DROP INDEX IF EXISTS "WorkItem_linkedProjectPhaseId_idx";
DROP INDEX IF EXISTS "WorkItem_linkedProjectTaskId_idx";
DROP INDEX IF EXISTS "WorkItem_sourceMeetingId_idx";
DROP INDEX IF EXISTS "WorkItem_sourceMeetingDecisionId_idx";
DROP INDEX IF EXISTS "WorkItem_sourceMeetingActionCandidateId_idx";
DROP INDEX IF EXISTS "WorkItem_sourceDepartmentId_idx";
DROP INDEX IF EXISTS "WorkItem_parentWorkItemId_idx";

ALTER TABLE "WorkItem" RENAME TO "old_WorkItem";
CREATE TABLE "WorkItem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "planId" INTEGER,
  "targetType" TEXT NOT NULL DEFAULT 'personal',
  "targetId" INTEGER,
  "category" TEXT NOT NULL,
  "itemType" TEXT NOT NULL DEFAULT 'task',
  "content" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "importance" INTEGER NOT NULL DEFAULT 3,
  "urgency" INTEGER NOT NULL DEFAULT 3,
  "status" TEXT,
  "completedAt" DATETIME,
  "krStartValue" REAL,
  "krTargetValue" REAL,
  "krCurrentValue" REAL,
  "krUnit" TEXT,
  "routineTaskType" TEXT,
  "routineRecurrenceType" TEXT,
  "routineRecurrenceTime" TEXT,
  "routineRecurrenceWeekday" INTEGER,
  "routineRecurrenceMonthDay" INTEGER,
  "routineRecurrenceQuarterDay" INTEGER,
  "routineRecurrenceYearMonth" INTEGER,
  "routineRecurrenceYearDay" INTEGER,
  "ownerEmployeeId" INTEGER,
  "startDate" DATETIME,
  "dueDate" DATETIME,
  "periodType" TEXT,
  "periodStart" DATETIME,
  "periodEnd" DATETIME,
  "sourceType" TEXT NOT NULL DEFAULT 'other',
  "sourceKind" TEXT,
  "sourceMeetingId" INTEGER,
  "sourceMeetingDecisionId" INTEGER,
  "sourceMeetingActionCandidateId" INTEGER,
  "sourceDepartmentId" INTEGER,
  "linkedProjectId" INTEGER,
  "linkedProjectPhaseId" INTEGER,
  "parentWorkItemId" INTEGER,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_linkedProjectPhaseId_fkey" FOREIGN KEY ("linkedProjectPhaseId") REFERENCES "ProjectPlanPhase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_sourceMeetingDecisionId_fkey" FOREIGN KEY ("sourceMeetingDecisionId") REFERENCES "MeetingDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_sourceMeetingActionCandidateId_fkey" FOREIGN KEY ("sourceMeetingActionCandidateId") REFERENCES "MeetingActionCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_sourceDepartmentId_fkey" FOREIGN KEY ("sourceDepartmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItem_parentWorkItemId_fkey" FOREIGN KEY ("parentWorkItemId") REFERENCES "WorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "WorkItem" ("id", "planId", "targetType", "targetId", "category", "itemType", "content", "description", "importance", "urgency", "status", "completedAt", "krStartValue", "krTargetValue", "krCurrentValue", "krUnit", "routineTaskType", "routineRecurrenceType", "routineRecurrenceTime", "routineRecurrenceWeekday", "routineRecurrenceMonthDay", "routineRecurrenceQuarterDay", "routineRecurrenceYearMonth", "routineRecurrenceYearDay", "ownerEmployeeId", "startDate", "dueDate", "periodType", "periodStart", "periodEnd", "sourceType", "sourceKind", "sourceMeetingId", "sourceMeetingDecisionId", "sourceMeetingActionCandidateId", "sourceDepartmentId", "linkedProjectId", "linkedProjectPhaseId", "parentWorkItemId", "isArchived", "isPrivate", "sortOrder", "createdAt")
SELECT "id", "planId", "targetType", "targetId", "category", "itemType", "content", "description", "importance", "urgency", "status", "completedAt", "krStartValue", "krTargetValue", "krCurrentValue", "krUnit", "routineTaskType", "routineRecurrenceType", "routineRecurrenceTime", "routineRecurrenceWeekday", "routineRecurrenceMonthDay", "routineRecurrenceQuarterDay", "routineRecurrenceYearMonth", "routineRecurrenceYearDay", "ownerEmployeeId", "startDate", "dueDate", "periodType", "periodStart", "periodEnd", "sourceType", CASE WHEN "sourceKind" = 'project_task' THEN 'project' ELSE "sourceKind" END, "sourceMeetingId", "sourceMeetingDecisionId", "sourceMeetingActionCandidateId", "sourceDepartmentId", "linkedProjectId", "linkedProjectPhaseId", "parentWorkItemId", "isArchived", "isPrivate", "sortOrder", "createdAt" FROM "old_WorkItem";
DROP TABLE "old_WorkItem";
CREATE INDEX "WorkItem_planId_parentWorkItemId_itemType_idx" ON "WorkItem"("planId", "parentWorkItemId", "itemType");
CREATE INDEX "WorkItem_planId_itemType_isArchived_idx" ON "WorkItem"("planId", "itemType", "isArchived");
CREATE INDEX "WorkItem_targetType_targetId_category_idx" ON "WorkItem"("targetType", "targetId", "category");
CREATE INDEX "WorkItem_targetType_targetId_periodType_periodStart_idx" ON "WorkItem"("targetType", "targetId", "periodType", "periodStart");
CREATE INDEX "WorkItem_targetType_targetId_parentWorkItemId_itemType_idx" ON "WorkItem"("targetType", "targetId", "parentWorkItemId", "itemType");
CREATE INDEX "WorkItem_targetType_targetId_itemType_isArchived_idx" ON "WorkItem"("targetType", "targetId", "itemType", "isArchived");
CREATE INDEX "WorkItem_sourceType_linkedProjectId_linkedProjectPhaseId_idx" ON "WorkItem"("sourceType", "linkedProjectId", "linkedProjectPhaseId");
CREATE INDEX "WorkItem_ownerEmployeeId_idx" ON "WorkItem"("ownerEmployeeId");
CREATE INDEX "WorkItem_status_idx" ON "WorkItem"("status");
CREATE INDEX "WorkItem_linkedProjectId_idx" ON "WorkItem"("linkedProjectId");
CREATE INDEX "WorkItem_linkedProjectPhaseId_idx" ON "WorkItem"("linkedProjectPhaseId");
CREATE INDEX "WorkItem_sourceMeetingId_idx" ON "WorkItem"("sourceMeetingId");
CREATE INDEX "WorkItem_sourceMeetingDecisionId_idx" ON "WorkItem"("sourceMeetingDecisionId");
CREATE INDEX "WorkItem_sourceMeetingActionCandidateId_idx" ON "WorkItem"("sourceMeetingActionCandidateId");
CREATE INDEX "WorkItem_sourceDepartmentId_idx" ON "WorkItem"("sourceDepartmentId");
CREATE INDEX "WorkItem_parentWorkItemId_idx" ON "WorkItem"("parentWorkItemId");

DROP INDEX IF EXISTS "MeetingActionCandidate_meetingId_status_idx";
DROP INDEX IF EXISTS "MeetingActionCandidate_decisionId_idx";
DROP INDEX IF EXISTS "MeetingActionCandidate_linkedWorkItemId_idx";
DROP INDEX IF EXISTS "MeetingActionCandidate_linkedWorkPlanId_idx";
DROP INDEX IF EXISTS "MeetingActionCandidate_linkedProjectTaskId_idx";

ALTER TABLE "MeetingActionCandidate" RENAME TO "old_MeetingActionCandidate";
CREATE TABLE "MeetingActionCandidate" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "meetingId" INTEGER NOT NULL,
  "agendaItemId" INTEGER,
  "decisionId" INTEGER,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "targetKind" TEXT NOT NULL DEFAULT 'work_item',
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "linkedWorkItemId" INTEGER,
  "linkedWorkPlanId" INTEGER,
  "createdBy" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingActionCandidate_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "MeetingDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_linkedWorkItemId_fkey" FOREIGN KEY ("linkedWorkItemId") REFERENCES "WorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_linkedWorkPlanId_fkey" FOREIGN KEY ("linkedWorkPlanId") REFERENCES "WorkPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "MeetingActionCandidate" ("id", "meetingId", "agendaItemId", "decisionId", "title", "description", "targetKind", "status", "linkedWorkItemId", "linkedWorkPlanId", "createdBy", "createdAt", "updatedAt")
SELECT "id", "meetingId", "agendaItemId", "decisionId", "title", "description", CASE WHEN "targetKind" = 'project_task' THEN 'work_plan' ELSE "targetKind" END, "status", "linkedWorkItemId", "linkedWorkPlanId", "createdBy", "createdAt", "updatedAt" FROM "old_MeetingActionCandidate";
DROP TABLE "old_MeetingActionCandidate";
CREATE INDEX "MeetingActionCandidate_meetingId_status_idx" ON "MeetingActionCandidate"("meetingId", "status");
CREATE INDEX "MeetingActionCandidate_decisionId_idx" ON "MeetingActionCandidate"("decisionId");
CREATE INDEX "MeetingActionCandidate_linkedWorkItemId_idx" ON "MeetingActionCandidate"("linkedWorkItemId");
CREATE INDEX "MeetingActionCandidate_linkedWorkPlanId_idx" ON "MeetingActionCandidate"("linkedWorkPlanId");

DROP TABLE IF EXISTS "ProjectTaskAssignment";
DROP TABLE IF EXISTS "ProjectTask";

PRAGMA foreign_keys=ON;
