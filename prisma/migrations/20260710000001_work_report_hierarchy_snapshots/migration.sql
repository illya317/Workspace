-- Preserve objective/KR hierarchy and the business actual-end date for report tables.

ALTER TABLE "WorkReportItem" ADD COLUMN "objectiveTitleSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "keyResultTitleSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "actualEndDateSnapshot" DATETIME;
