-- Preserve the task schedule and status seen when a weekly or monthly work report is saved.

ALTER TABLE "WorkReportItem" ADD COLUMN "reportItemKindSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "workItemStatusSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "plannedStartDateSnapshot" DATETIME;
ALTER TABLE "WorkReportItem" ADD COLUMN "plannedEndDateSnapshot" DATETIME;
ALTER TABLE "WorkReportItem" ADD COLUMN "completedAtSnapshot" DATETIME;

UPDATE "WorkReportItem"
SET "reportItemKindSnapshot" = CASE
  WHEN "workPlanKindSnapshot" = 'routine' THEN 'routine'
  WHEN trim("doneThisWeek") <> '' THEN 'current'
  WHEN trim("planNextWeek") <> '' THEN 'next'
  ELSE ''
END;
