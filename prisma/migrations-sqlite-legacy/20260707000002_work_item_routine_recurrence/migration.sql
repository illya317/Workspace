ALTER TABLE "WorkItem" ADD COLUMN "routineRecurrenceType" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "routineRecurrenceTime" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "routineRecurrenceWeekday" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "routineRecurrenceMonthDay" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "routineRecurrenceQuarterDay" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "routineRecurrenceYearMonth" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "routineRecurrenceYearDay" INTEGER;

UPDATE "WorkItem"
SET
  "routineRecurrenceType" = 'daily',
  "routineRecurrenceTime" = '09:00'
WHERE "routineTaskType" = 'recurring'
  AND "routineRecurrenceType" IS NULL;
