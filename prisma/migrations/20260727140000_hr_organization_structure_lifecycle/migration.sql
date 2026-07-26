-- workspace:migration-mode=expand

ALTER TABLE "PositionReportOverride"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "OrganizationStructureChange" (
  "id" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" INTEGER NOT NULL,
  "commandKind" TEXT NOT NULL,
  "effectiveOn" TEXT NOT NULL,
  "expectedSequence" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "reason" TEXT,
  "effectManifestJson" TEXT NOT NULL,
  "actorUserId" INTEGER NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationStructureChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationStructureChange_effectiveOn_check"
    CHECK ("effectiveOn" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT "OrganizationStructureChange_commandKind_check"
    CHECK ("commandKind" IN ('schedule', 'correct', 'end-date', 'cancel-future', 'baseline'))
);

CREATE UNIQUE INDEX "OrganizationStructureChange_idempotencyKey_key"
  ON "OrganizationStructureChange"("idempotencyKey");
CREATE INDEX "OrganizationStructureChange_aggregate_recorded_idx"
  ON "OrganizationStructureChange"("aggregateType", "aggregateId", "recordedAt");
CREATE INDEX "OrganizationStructureChange_actorUserId_recordedAt_idx"
  ON "OrganizationStructureChange"("actorUserId", "recordedAt");

CREATE TABLE "DepartmentEffectiveVersion" (
  "id" SERIAL NOT NULL,
  "departmentId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "validFrom" TEXT,
  "validToExclusive" TEXT,
  "recordState" TEXT NOT NULL DEFAULT 'confirmed',
  "changeKind" TEXT NOT NULL,
  "supersedesId" INTEGER,
  "sourceChangeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "alias" TEXT,
  "hierarchyKind" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "parentId" INTEGER,
  "managerPositionId" INTEGER,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentEffectiveVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DepartmentEffectiveVersion_period_check"
    CHECK (("validFrom" IS NULL OR "validFrom" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND ("validToExclusive" IS NULL OR "validToExclusive" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND ("validFrom" IS NULL OR "validToExclusive" IS NULL OR "validFrom" < "validToExclusive")),
  CONSTRAINT "DepartmentEffectiveVersion_recordState_check"
    CHECK ("recordState" IN ('confirmed', 'cancelled', 'superseded', 'unknown')),
  CONSTRAINT "DepartmentEffectiveVersion_changeKind_check"
    CHECK ("changeKind" IN ('baseline', 'schedule', 'correct', 'end-date', 'cancel-future'))
);

CREATE UNIQUE INDEX "DepartmentEffectiveVersion_departmentId_sequence_key"
  ON "DepartmentEffectiveVersion"("departmentId", "sequence");
CREATE INDEX "DepartmentEffectiveVersion_anchor_period_idx"
  ON "DepartmentEffectiveVersion"("departmentId", "validFrom", "validToExclusive");
CREATE INDEX "DepartmentEffectiveVersion_parentId_idx" ON "DepartmentEffectiveVersion"("parentId");
CREATE INDEX "DepartmentEffectiveVersion_managerPositionId_idx" ON "DepartmentEffectiveVersion"("managerPositionId");
CREATE INDEX "DepartmentEffectiveVersion_sourceChangeId_idx" ON "DepartmentEffectiveVersion"("sourceChangeId");
CREATE INDEX "DepartmentEffectiveVersion_supersedesId_idx" ON "DepartmentEffectiveVersion"("supersedesId");

CREATE TABLE "PositionEffectiveVersion" (
  "id" SERIAL NOT NULL,
  "positionId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "validFrom" TEXT,
  "validToExclusive" TEXT,
  "recordState" TEXT NOT NULL DEFAULT 'confirmed',
  "changeKind" TEXT NOT NULL,
  "supersedesId" INTEGER,
  "sourceChangeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "alias" TEXT,
  "departmentId" INTEGER,
  "reportToPositionId" INTEGER,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionEffectiveVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PositionEffectiveVersion_period_check"
    CHECK (("validFrom" IS NULL OR "validFrom" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND ("validToExclusive" IS NULL OR "validToExclusive" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND ("validFrom" IS NULL OR "validToExclusive" IS NULL OR "validFrom" < "validToExclusive")),
  CONSTRAINT "PositionEffectiveVersion_recordState_check"
    CHECK ("recordState" IN ('confirmed', 'cancelled', 'superseded', 'unknown')),
  CONSTRAINT "PositionEffectiveVersion_changeKind_check"
    CHECK ("changeKind" IN ('baseline', 'schedule', 'correct', 'end-date', 'cancel-future'))
);

CREATE UNIQUE INDEX "PositionEffectiveVersion_positionId_sequence_key"
  ON "PositionEffectiveVersion"("positionId", "sequence");
CREATE INDEX "PositionEffectiveVersion_anchor_period_idx"
  ON "PositionEffectiveVersion"("positionId", "validFrom", "validToExclusive");
CREATE INDEX "PositionEffectiveVersion_departmentId_idx" ON "PositionEffectiveVersion"("departmentId");
CREATE INDEX "PositionEffectiveVersion_reportToPositionId_idx" ON "PositionEffectiveVersion"("reportToPositionId");
CREATE INDEX "PositionEffectiveVersion_sourceChangeId_idx" ON "PositionEffectiveVersion"("sourceChangeId");
CREATE INDEX "PositionEffectiveVersion_supersedesId_idx" ON "PositionEffectiveVersion"("supersedesId");

CREATE TABLE "PositionReportOverrideEffectiveVersion" (
  "id" SERIAL NOT NULL,
  "positionReportOverrideId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "validFrom" TEXT,
  "validToExclusive" TEXT,
  "recordState" TEXT NOT NULL DEFAULT 'confirmed',
  "changeKind" TEXT NOT NULL,
  "supersedesId" INTEGER,
  "sourceChangeId" TEXT NOT NULL,
  "reportToPositionId" INTEGER,
  "headcount" INTEGER,
  "remark" TEXT,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "departmentId" INTEGER,
  CONSTRAINT "PositionReportOverrideEffectiveVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PositionReportOverrideEffectiveVersion_period_check"
    CHECK (("validFrom" IS NULL OR "validFrom" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND ("validToExclusive" IS NULL OR "validToExclusive" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND ("validFrom" IS NULL OR "validToExclusive" IS NULL OR "validFrom" < "validToExclusive")),
  CONSTRAINT "PositionReportOverrideEffectiveVersion_recordState_check"
    CHECK ("recordState" IN ('confirmed', 'cancelled', 'superseded', 'unknown')),
  CONSTRAINT "PositionReportOverrideEffectiveVersion_changeKind_check"
    CHECK ("changeKind" IN ('baseline', 'schedule', 'correct', 'end-date', 'cancel-future'))
);

CREATE UNIQUE INDEX "PROEffectiveVersion_anchor_sequence_key"
  ON "PositionReportOverrideEffectiveVersion"("positionReportOverrideId", "sequence");
CREATE INDEX "PROEffectiveVersion_anchor_period_idx"
  ON "PositionReportOverrideEffectiveVersion"("positionReportOverrideId", "validFrom", "validToExclusive");
CREATE INDEX "PositionReportOverrideEffectiveVersion_reportToPositionId_idx"
  ON "PositionReportOverrideEffectiveVersion"("reportToPositionId");
CREATE INDEX "PositionReportOverrideEffectiveVersion_departmentId_idx"
  ON "PositionReportOverrideEffectiveVersion"("departmentId");
CREATE INDEX "PositionReportOverrideEffectiveVersion_sourceChangeId_idx"
  ON "PositionReportOverrideEffectiveVersion"("sourceChangeId");
CREATE INDEX "PositionReportOverrideEffectiveVersion_supersedesId_idx"
  ON "PositionReportOverrideEffectiveVersion"("supersedesId");

ALTER TABLE "DepartmentEffectiveVersion"
  ADD CONSTRAINT "DepartmentEffectiveVersion_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DepartmentEffectiveVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DepartmentEffectiveVersion_managerPositionId_fkey" FOREIGN KEY ("managerPositionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DepartmentEffectiveVersion_sourceChangeId_fkey" FOREIGN KEY ("sourceChangeId") REFERENCES "OrganizationStructureChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DepartmentEffectiveVersion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "DepartmentEffectiveVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PositionEffectiveVersion"
  ADD CONSTRAINT "PositionEffectiveVersion_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionEffectiveVersion_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionEffectiveVersion_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionEffectiveVersion_sourceChangeId_fkey" FOREIGN KEY ("sourceChangeId") REFERENCES "OrganizationStructureChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionEffectiveVersion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PositionEffectiveVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PositionReportOverrideEffectiveVersion"
  ADD CONSTRAINT "PROEffectiveVersion_anchor_fkey" FOREIGN KEY ("positionReportOverrideId") REFERENCES "PositionReportOverride"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionReportOverrideEffectiveVersion_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionReportOverrideEffectiveVersion_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionReportOverrideEffectiveVersion_sourceChangeId_fkey" FOREIGN KEY ("sourceChangeId") REFERENCES "OrganizationStructureChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PositionReportOverrideEffectiveVersion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PositionReportOverrideEffectiveVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "OrganizationStructureChange" (
  "id", "aggregateType", "aggregateId", "commandKind", "effectiveOn", "expectedSequence",
  "idempotencyKey", "requestFingerprint", "reason", "effectManifestJson", "actorUserId"
)
SELECT md5('department:' || d."id"::text)::uuid::text, 'Department', d."id", 'baseline', '0001-01-01', d."version",
  'migration:department:' || d."id"::text, md5('migration:department:' || d."id"::text), '旧库基线；迁移前生效日未知', '{"provenance":"unknown-baseline"}', COALESCE(d."editedBy", 0)
FROM "Department" d;

INSERT INTO "DepartmentEffectiveVersion" (
  "departmentId", "sequence", "validFrom", "recordState", "changeKind", "sourceChangeId",
  "code", "name", "alias", "hierarchyKind", "level", "parentId", "managerPositionId", "createdBy"
)
SELECT d."id", d."version", NULL, 'unknown', 'baseline', md5('department:' || d."id"::text)::uuid::text,
  d."code", d."name", d."alias", d."hierarchyKind", d."level", d."parentId", d."managerPositionId", COALESCE(d."editedBy", 0)
FROM "Department" d;

INSERT INTO "OrganizationStructureChange" (
  "id", "aggregateType", "aggregateId", "commandKind", "effectiveOn", "expectedSequence",
  "idempotencyKey", "requestFingerprint", "reason", "effectManifestJson", "actorUserId"
)
SELECT md5('position:' || p."id"::text)::uuid::text, 'Position', p."id", 'baseline', '0001-01-01', p."version",
  'migration:position:' || p."id"::text, md5('migration:position:' || p."id"::text), '旧库基线；迁移前生效日未知', '{"provenance":"unknown-baseline"}', COALESCE(p."editedBy", 0)
FROM "Position" p;

INSERT INTO "PositionEffectiveVersion" (
  "positionId", "sequence", "validFrom", "recordState", "changeKind", "sourceChangeId",
  "code", "name", "alias", "departmentId", "reportToPositionId", "createdBy"
)
SELECT p."id", p."version", NULL, 'unknown', 'baseline', md5('position:' || p."id"::text)::uuid::text,
  p."code", p."name", p."alias", p."departmentId", p."reportToPositionId", COALESCE(p."editedBy", 0)
FROM "Position" p;

INSERT INTO "OrganizationStructureChange" (
  "id", "aggregateType", "aggregateId", "commandKind", "effectiveOn", "expectedSequence",
  "idempotencyKey", "requestFingerprint", "reason", "effectManifestJson", "actorUserId"
)
SELECT md5('position-report-override:' || o."id"::text)::uuid::text, 'PositionReportOverride', o."id", 'baseline', '0001-01-01', 1,
  'migration:position-report-override:' || o."id"::text, md5('migration:position-report-override:' || o."id"::text), '旧库基线；迁移前生效日未知', '{"provenance":"unknown-baseline"}', COALESCE(o."editedBy", 0)
FROM "PositionReportOverride" o;

INSERT INTO "PositionReportOverrideEffectiveVersion" (
  "positionReportOverrideId", "sequence", "validFrom", "recordState", "changeKind", "sourceChangeId",
  "reportToPositionId", "headcount", "remark", "departmentId", "createdBy"
)
SELECT o."id", 1, NULL, CASE WHEN o."isActive" THEN 'unknown' ELSE 'cancelled' END, 'baseline',
  md5('position-report-override:' || o."id"::text)::uuid::text,
  o."reportToPositionId", o."headcount", o."remark", o."departmentId", COALESCE(o."editedBy", 0)
FROM "PositionReportOverride" o;

CREATE FUNCTION "reject_organization_effective_version_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only; use an organization structure lifecycle command', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DepartmentEffectiveVersion_append_only"
  BEFORE UPDATE OR DELETE ON "DepartmentEffectiveVersion"
  FOR EACH ROW EXECUTE FUNCTION "reject_organization_effective_version_mutation"();
CREATE TRIGGER "PositionEffectiveVersion_append_only"
  BEFORE UPDATE OR DELETE ON "PositionEffectiveVersion"
  FOR EACH ROW EXECUTE FUNCTION "reject_organization_effective_version_mutation"();
CREATE TRIGGER "PositionReportOverrideEffectiveVersion_append_only"
  BEFORE UPDATE OR DELETE ON "PositionReportOverrideEffectiveVersion"
  FOR EACH ROW EXECUTE FUNCTION "reject_organization_effective_version_mutation"();
CREATE TRIGGER "OrganizationStructureChange_append_only"
  BEFORE UPDATE OR DELETE ON "OrganizationStructureChange"
  FOR EACH ROW EXECUTE FUNCTION "reject_organization_effective_version_mutation"();

CREATE FUNCTION "check_organization_effective_version_overlap"() RETURNS trigger AS $$
DECLARE
  aggregate_column text;
  conflict_exists boolean;
BEGIN
  aggregate_column := CASE TG_TABLE_NAME
    WHEN 'DepartmentEffectiveVersion' THEN 'departmentId'
    WHEN 'PositionEffectiveVersion' THEN 'positionId'
    ELSE 'positionReportOverrideId'
  END;
  EXECUTE format(
    'SELECT EXISTS (
      SELECT 1 FROM %I a JOIN %I b
        ON a.%I = b.%I AND a.id < b.id
      WHERE a."recordState" IN (''confirmed'', ''unknown'')
        AND b."recordState" IN (''confirmed'', ''unknown'')
        AND NOT EXISTS (SELECT 1 FROM %I x WHERE x."supersedesId" = a.id)
        AND NOT EXISTS (SELECT 1 FROM %I x WHERE x."supersedesId" = b.id)
        AND daterange(COALESCE(a."validFrom", ''0001-01-01'')::date, COALESCE(a."validToExclusive", ''infinity'')::date, ''[)'')
          && daterange(COALESCE(b."validFrom", ''0001-01-01'')::date, COALESCE(b."validToExclusive", ''infinity'')::date, ''[)'')
    )',
    TG_TABLE_NAME, TG_TABLE_NAME, aggregate_column, aggregate_column, TG_TABLE_NAME, TG_TABLE_NAME
  ) INTO conflict_exists;
  IF conflict_exists THEN
    RAISE EXCEPTION '% has overlapping live effective versions', TG_TABLE_NAME;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "DepartmentEffectiveVersion_no_live_overlap"
  AFTER INSERT ON "DepartmentEffectiveVersion" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_organization_effective_version_overlap"();
CREATE CONSTRAINT TRIGGER "PositionEffectiveVersion_no_live_overlap"
  AFTER INSERT ON "PositionEffectiveVersion" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_organization_effective_version_overlap"();
CREATE CONSTRAINT TRIGGER "PositionReportOverrideEffectiveVersion_no_live_overlap"
  AFTER INSERT ON "PositionReportOverrideEffectiveVersion" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_organization_effective_version_overlap"();
