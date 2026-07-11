ALTER TABLE "Notification" ADD COLUMN "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Notification"
SET "requiresAcknowledgement" = true
WHERE "isImportant" = true
   OR "acknowledgedAt" IS NOT NULL
   OR "rejectedAt" IS NOT NULL;
