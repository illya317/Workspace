CREATE TABLE "WorkReport" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetType" TEXT NOT NULL,
  "targetId" INTEGER NOT NULL,
  "periodType" TEXT NOT NULL DEFAULT 'weekly',
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "submittedBy" INTEGER NOT NULL,
  "submittedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkReport_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WorkReportItem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "reportId" INTEGER NOT NULL,
  "workItemId" INTEGER,
  "title" TEXT NOT NULL,
  "previousPlanSnapshot" TEXT NOT NULL DEFAULT '',
  "doneThisWeek" TEXT NOT NULL DEFAULT '',
  "planNextWeek" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "WorkReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WorkReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkReportItem_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkReport_targetType_targetId_periodType_periodStart_submittedBy_key" ON "WorkReport"("targetType", "targetId", "periodType", "periodStart", "submittedBy");
CREATE INDEX "WorkReport_submittedBy_idx" ON "WorkReport"("submittedBy");
CREATE INDEX "WorkReport_targetType_targetId_periodType_periodStart_idx" ON "WorkReport"("targetType", "targetId", "periodType", "periodStart");
CREATE INDEX "WorkReportItem_reportId_idx" ON "WorkReportItem"("reportId");
CREATE INDEX "WorkReportItem_workItemId_idx" ON "WorkReportItem"("workItemId");
