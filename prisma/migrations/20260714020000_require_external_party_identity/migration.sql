BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ExternalParty"
    WHERE nullif(trim("identityNumber"), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'ExternalParty identityNumber is required; complete missing unified codes or identity numbers before this migration';
  END IF;
END $$;

ALTER TABLE "ExternalParty"
ALTER COLUMN "identityNumber" SET NOT NULL;

COMMIT;
