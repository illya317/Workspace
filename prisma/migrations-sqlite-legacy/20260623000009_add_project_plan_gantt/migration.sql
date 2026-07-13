ALTER TABLE "Project" ADD COLUMN "planPhaseId" INTEGER;
ALTER TABLE "ProjectTask" ADD COLUMN "planPhaseId" INTEGER;

CREATE TABLE "ProjectPlanPhase" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "projectId" INTEGER NOT NULL,
  "sequenceNo" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATETIME,
  "endDate" DATETIME,
  "note" TEXT,
  "createdBy" INTEGER,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectPlanPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectPlanDependency" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "projectId" INTEGER NOT NULL,
  "predecessorKind" TEXT NOT NULL,
  "predecessorId" INTEGER NOT NULL,
  "successorKind" TEXT NOT NULL,
  "successorId" INTEGER NOT NULL,
  "dependencyType" TEXT NOT NULL DEFAULT 'finish_start',
  "lagDays" INTEGER NOT NULL DEFAULT 1,
  "createdBy" INTEGER,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectPlanDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectPlanBaseline" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "projectId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" INTEGER,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectPlanBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectPlanBaselineItem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "baselineId" INTEGER NOT NULL,
  "itemKind" TEXT NOT NULL,
  "itemId" INTEGER NOT NULL,
  "parentKind" TEXT,
  "parentId" INTEGER,
  "phaseId" INTEGER,
  "name" TEXT NOT NULL,
  "status" TEXT,
  "isMilestone" BOOLEAN NOT NULL DEFAULT false,
  "startDate" DATETIME,
  "endDate" DATETIME,
  CONSTRAINT "ProjectPlanBaselineItem_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ProjectPlanBaseline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectPlanPhase_projectId_sequenceNo_key" ON "ProjectPlanPhase"("projectId", "sequenceNo");
CREATE INDEX "ProjectPlanPhase_projectId_sequenceNo_idx" ON "ProjectPlanPhase"("projectId", "sequenceNo");
CREATE INDEX "Project_planPhaseId_idx" ON "Project"("planPhaseId");
CREATE INDEX "ProjectTask_planPhaseId_idx" ON "ProjectTask"("planPhaseId");

CREATE UNIQUE INDEX "ProjectPlanDependency_projectId_predecessorKind_predecessorId_successorKind_successorId_key"
  ON "ProjectPlanDependency"("projectId", "predecessorKind", "predecessorId", "successorKind", "successorId");
CREATE INDEX "ProjectPlanDependency_projectId_successorKind_successorId_idx"
  ON "ProjectPlanDependency"("projectId", "successorKind", "successorId");
CREATE INDEX "ProjectPlanDependency_projectId_predecessorKind_predecessorId_idx"
  ON "ProjectPlanDependency"("projectId", "predecessorKind", "predecessorId");

CREATE INDEX "ProjectPlanBaseline_projectId_isActive_idx" ON "ProjectPlanBaseline"("projectId", "isActive");
CREATE UNIQUE INDEX "ProjectPlanBaselineItem_baselineId_itemKind_itemId_key" ON "ProjectPlanBaselineItem"("baselineId", "itemKind", "itemId");
CREATE INDEX "ProjectPlanBaselineItem_baselineId_phaseId_idx" ON "ProjectPlanBaselineItem"("baselineId", "phaseId");

INSERT OR IGNORE INTO "ProjectPlanDependency" (
  "projectId",
  "predecessorKind",
  "predecessorId",
  "successorKind",
  "successorId",
  "dependencyType",
  "lagDays",
  "createdBy",
  "editedBy"
)
SELECT
  "projectId",
  'task',
  "predecessorTaskId",
  'task',
  "id",
  'finish_start',
  1,
  "createdBy",
  "editedBy"
FROM "ProjectTask"
WHERE "predecessorTaskId" IS NOT NULL;
