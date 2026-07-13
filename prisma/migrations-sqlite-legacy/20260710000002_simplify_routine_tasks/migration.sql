-- Collapse temporary and recurring routine task identities into one ordinary task type.

UPDATE "WorkItem"
SET "routineTaskType" = 'task'
WHERE "routineTaskType" IN ('recurring', 'once');
