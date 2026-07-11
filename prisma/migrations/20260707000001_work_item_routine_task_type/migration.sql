ALTER TABLE "WorkItem" ADD COLUMN "routineTaskType" TEXT;

UPDATE "WorkItem"
SET "routineTaskType" = 'standing'
WHERE "itemType" = 'task'
  AND "planId" IN (
    SELECT "id"
    FROM "WorkPlan"
    WHERE "kind" = 'routine'
  );
