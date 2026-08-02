-- workspace:migration-mode=maintenance
-- Business Temporal template: stable PositionDescription header + immutable revisions.
CREATE TABLE "PositionDescriptionRevision" (
  "id" SERIAL NOT NULL,
  "revisionUid" TEXT NOT NULL,
  "positionDescriptionId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "changeKind" TEXT NOT NULL DEFAULT 'change',
  "supersedesRevisionId" INTEGER,
  "positionPurpose" TEXT,
  "summary" TEXT,
  "headcount" INTEGER,
  "version" TEXT,
  "effectiveDate" TEXT,
  "sourceFile" TEXT NOT NULL,
  "details" TEXT,
  "changeReason" TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionDescriptionRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PositionDescriptionRevision_change_kind_check" CHECK ("changeKind" IN ('initial', 'change', 'correction')),
  CONSTRAINT "PositionDescriptionRevision_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "PositionDescriptionRevision_effective_date_check" CHECK ("effectiveDate" IS NULL OR "effectiveDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

INSERT INTO "PositionDescriptionRevision" (
  "revisionUid", "positionDescriptionId", "sequence", "changeKind",
  "positionPurpose", "summary", "headcount", "version", "effectiveDate",
  "sourceFile", "details", "createdBy", "createdAt"
)
SELECT
  'legacy:position-description:' || "id", "id", 1, 'initial',
  "positionPurpose", "summary", "headcount", "version", "effectiveDate",
  "sourceFile", "details", "editedBy", COALESCE("editedAt", "createdAt")
FROM "PositionDescription";

CREATE UNIQUE INDEX "PositionDescriptionRevision_revisionUid_key" ON "PositionDescriptionRevision"("revisionUid");
CREATE UNIQUE INDEX "PositionDescriptionRevision_positionDescriptionId_sequence_key" ON "PositionDescriptionRevision"("positionDescriptionId", "sequence");
CREATE INDEX "PositionDescriptionRevision_effective_idx" ON "PositionDescriptionRevision"("positionDescriptionId", "effectiveDate", "sequence");
CREATE INDEX "PositionDescriptionRevision_supersedesRevisionId_idx" ON "PositionDescriptionRevision"("supersedesRevisionId");

ALTER TABLE "PositionDescriptionRevision"
  ADD CONSTRAINT "PositionDescriptionRevision_positionDescriptionId_fkey"
  FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PositionDescriptionRevision"
  ADD CONSTRAINT "PositionDescriptionRevision_supersedesRevisionId_fkey"
  FOREIGN KEY ("supersedesRevisionId") REFERENCES "PositionDescriptionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PositionResponsibilityNode" ADD COLUMN "positionDescriptionRevisionId" INTEGER;
UPDATE "PositionResponsibilityNode" node
SET "positionDescriptionRevisionId" = revision."id"
FROM "PositionDescriptionRevision" revision
WHERE revision."positionDescriptionId" = node."positionDescriptionId" AND revision."sequence" = 1;
ALTER TABLE "PositionResponsibilityNode" ALTER COLUMN "positionDescriptionRevisionId" SET NOT NULL;
ALTER TABLE "PositionResponsibilityNode"
  ADD CONSTRAINT "PositionResponsibilityNode_positionDescriptionRevisionId_fkey"
  FOREIGN KEY ("positionDescriptionRevisionId") REFERENCES "PositionDescriptionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PositionResponsibilityNode_revision_type_active_idx"
  ON "PositionResponsibilityNode"("positionDescriptionRevisionId", "nodeType", "isActive");

ALTER TABLE "PositionDescription" ADD COLUMN "createdBy" INTEGER;
UPDATE "PositionDescription" SET "createdBy" = "editedBy";
ALTER TABLE "PositionDescription"
  DROP COLUMN "positionPurpose",
  DROP COLUMN "summary",
  DROP COLUMN "headcount",
  DROP COLUMN "version",
  DROP COLUMN "effectiveDate",
  DROP COLUMN "sourceFile",
  DROP COLUMN "details",
  DROP COLUMN "editedBy",
  DROP COLUMN "editedAt";

CREATE OR REPLACE FUNCTION workspace_reject_position_description_revision_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PositionDescriptionRevision is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PositionDescriptionRevision_immutable_update"
BEFORE UPDATE ON "PositionDescriptionRevision"
FOR EACH ROW EXECUTE FUNCTION workspace_reject_position_description_revision_mutation();

CREATE TRIGGER "PositionDescriptionRevision_immutable_delete"
BEFORE DELETE ON "PositionDescriptionRevision"
FOR EACH ROW EXECUTE FUNCTION workspace_reject_position_description_revision_mutation();
