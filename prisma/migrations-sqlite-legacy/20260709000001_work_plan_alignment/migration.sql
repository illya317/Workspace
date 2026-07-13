CREATE TABLE "WorkPlanAlignment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "childPlanId" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourcePlanId" INTEGER,
  "sourceWorkItemId" INTEGER,
  "relationKind" TEXT NOT NULL DEFAULT 'decompose',
  "note" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPlanAlignment_childPlanId_fkey" FOREIGN KEY ("childPlanId") REFERENCES "WorkPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkPlanAlignment_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "WorkPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkPlanAlignment_sourceWorkItemId_fkey" FOREIGN KEY ("sourceWorkItemId") REFERENCES "WorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "WorkPlanAlignment" (
  "childPlanId",
  "sourceType",
  "sourcePlanId",
  "relationKind",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  'plan',
  "parentPeriodPlanId",
  'decompose',
  0,
  "createdAt",
  "updatedAt"
FROM "WorkPlan"
WHERE "parentPeriodPlanId" IS NOT NULL;

INSERT INTO "WorkPlanAlignment" (
  "childPlanId",
  "sourceType",
  "sourcePlanId",
  "relationKind",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  'plan',
  "sourcePlanId",
  'decompose',
  1,
  "createdAt",
  "updatedAt"
FROM "WorkPlan"
WHERE "sourcePlanId" IS NOT NULL
  AND ("parentPeriodPlanId" IS NULL OR "sourcePlanId" <> "parentPeriodPlanId");

CREATE INDEX "WorkPlanAlignment_childPlanId_relationKind_sortOrder_idx" ON "WorkPlanAlignment"("childPlanId", "relationKind", "sortOrder");
CREATE INDEX "WorkPlanAlignment_sourceType_sourcePlanId_idx" ON "WorkPlanAlignment"("sourceType", "sourcePlanId");
CREATE INDEX "WorkPlanAlignment_sourceType_sourceWorkItemId_idx" ON "WorkPlanAlignment"("sourceType", "sourceWorkItemId");
