-- Create OKR cycle and control-policy tables.
CREATE TABLE "WorkOkrCycle" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "periodType" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "parentId" INTEGER,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOkrCycle_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkOkrCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorkOkrControlPolicy" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "cycleId" INTEGER NOT NULL,
  "scopeType" TEXT NOT NULL DEFAULT 'global',
  "scopeId" TEXT NOT NULL DEFAULT '',
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "objectiveSubmitDeadline" DATETIME,
  "krReviewOpensAt" DATETIME,
  "krSubmitDeadline" DATETIME,
  "createdByUserId" INTEGER,
  "updatedByUserId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOkrControlPolicy_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "WorkOkrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkOkrCycle_code_key" ON "WorkOkrCycle" ("code");
CREATE INDEX "WorkOkrCycle_periodType_year_sequence_idx" ON "WorkOkrCycle" ("periodType", "year", "sequence");
CREATE INDEX "WorkOkrCycle_parentId_idx" ON "WorkOkrCycle" ("parentId");
CREATE INDEX "WorkOkrCycle_startDate_endDate_idx" ON "WorkOkrCycle" ("startDate", "endDate");
CREATE UNIQUE INDEX "WorkOkrControlPolicy_cycleId_scopeType_scopeId_key" ON "WorkOkrControlPolicy" ("cycleId", "scopeType", "scopeId");
CREATE INDEX "WorkOkrControlPolicy_scopeType_scopeId_idx" ON "WorkOkrControlPolicy" ("scopeType", "scopeId");
CREATE INDEX "WorkOkrControlPolicy_krReviewOpensAt_idx" ON "WorkOkrControlPolicy" ("krReviewOpensAt");

ALTER TABLE "WorkPlan" ADD COLUMN "okrCycleId" INTEGER REFERENCES "WorkOkrCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkPlan" ADD COLUMN "sourcePlanId" INTEGER REFERENCES "WorkPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkPlan" ADD COLUMN "okrControlScopeType" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN "okrControlScopeId" TEXT;
ALTER TABLE "WorkPlan" ADD COLUMN "objectiveApprovalSnapshotJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "WorkPlan" ADD COLUMN "krApprovalSnapshotJson" TEXT NOT NULL DEFAULT '{}';

CREATE INDEX "WorkPlan_okrCycleId_idx" ON "WorkPlan" ("okrCycleId");
CREATE INDEX "WorkPlan_sourcePlanId_idx" ON "WorkPlan" ("sourcePlanId");
CREATE INDEX "WorkPlan_okrControlScopeType_okrControlScopeId_idx" ON "WorkPlan" ("okrControlScopeType", "okrControlScopeId");

-- Backfill cycles for existing dated OKR plans. Legacy day/week periods stay supported as data, but new OKR creation will use month/quarter/half/year cycles.
INSERT OR IGNORE INTO "WorkOkrCycle" ("periodType", "code", "label", "year", "sequence", "startDate", "endDate")
SELECT DISTINCT
  "periodType",
  CASE
    WHEN "periodType" = 'monthly' THEN strftime('%Y-%m', "periodStart")
    WHEN "periodType" = 'quarterly' THEN strftime('%Y', "periodStart") || '-Q' || CAST(((CAST(strftime('%m', "periodStart") AS INTEGER) - 1) / 3 + 1) AS INTEGER)
    WHEN "periodType" = 'yearly' THEN strftime('%Y', "periodStart")
    WHEN "periodType" = 'weekly' THEN strftime('%Y', "periodStart") || '-W' || strftime('%W', "periodStart")
    ELSE date("periodStart")
  END,
  CASE
    WHEN "periodType" = 'monthly' THEN strftime('%Y-%m', "periodStart")
    WHEN "periodType" = 'quarterly' THEN strftime('%Y', "periodStart") || ' Q' || CAST(((CAST(strftime('%m', "periodStart") AS INTEGER) - 1) / 3 + 1) AS INTEGER)
    WHEN "periodType" = 'yearly' THEN strftime('%Y', "periodStart") || ' 年'
    WHEN "periodType" = 'weekly' THEN date("periodStart") || ' 周'
    ELSE date("periodStart")
  END,
  CAST(strftime('%Y', "periodStart") AS INTEGER),
  CASE
    WHEN "periodType" = 'monthly' THEN CAST(strftime('%m', "periodStart") AS INTEGER)
    WHEN "periodType" = 'quarterly' THEN CAST(((CAST(strftime('%m', "periodStart") AS INTEGER) - 1) / 3 + 1) AS INTEGER)
    WHEN "periodType" = 'weekly' THEN CAST(strftime('%W', "periodStart") AS INTEGER)
    ELSE 1
  END,
  date("periodStart"),
  date("periodEnd")
FROM "WorkPlan"
WHERE "periodType" IS NOT NULL
  AND "periodStart" IS NOT NULL
  AND "periodEnd" IS NOT NULL;

UPDATE "WorkPlan"
SET "okrCycleId" = (
  SELECT "id"
  FROM "WorkOkrCycle"
  WHERE "code" = CASE
    WHEN "WorkPlan"."periodType" = 'monthly' THEN strftime('%Y-%m', "WorkPlan"."periodStart")
    WHEN "WorkPlan"."periodType" = 'quarterly' THEN strftime('%Y', "WorkPlan"."periodStart") || '-Q' || CAST(((CAST(strftime('%m', "WorkPlan"."periodStart") AS INTEGER) - 1) / 3 + 1) AS INTEGER)
    WHEN "WorkPlan"."periodType" = 'yearly' THEN strftime('%Y', "WorkPlan"."periodStart")
    WHEN "WorkPlan"."periodType" = 'weekly' THEN strftime('%Y', "WorkPlan"."periodStart") || '-W' || strftime('%W', "WorkPlan"."periodStart")
    ELSE date("WorkPlan"."periodStart")
  END
)
WHERE "okrCycleId" IS NULL
  AND "periodType" IS NOT NULL
  AND "periodStart" IS NOT NULL
  AND "periodEnd" IS NOT NULL;

UPDATE "WorkPlan"
SET
  "okrControlScopeType" = "targetType",
  "okrControlScopeId" = CAST("targetId" AS TEXT)
WHERE "targetType" IN ('company', 'committee', 'department');
