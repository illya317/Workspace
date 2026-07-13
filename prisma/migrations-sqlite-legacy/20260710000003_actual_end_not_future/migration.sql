-- Actual-end fields are facts and cannot point to a future date.
UPDATE "WorkItem"
SET "dueDate" = NULL
WHERE "dueDate" IS NOT NULL
  AND date("dueDate") > date('now', 'localtime');

-- System OKR plans use okrCycle/planned dates for their cycle window; actual dates start empty.
UPDATE "WorkPlan"
SET "periodStart" = NULL,
    "periodEnd" = NULL
WHERE "isSystemGenerated" = 1
  AND "okrCycleId" IS NOT NULL;

UPDATE "WorkPlan"
SET "periodEnd" = NULL
WHERE "periodEnd" IS NOT NULL
  AND date("periodEnd") > date('now', 'localtime');

UPDATE "Project"
SET "endDate" = NULL
WHERE "endDate" IS NOT NULL
  AND date("endDate") > date('now', 'localtime');
