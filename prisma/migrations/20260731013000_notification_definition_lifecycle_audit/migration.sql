-- workspace:migration-mode=maintenance
-- Add an immutable lifecycle ledger for low-code notification definition state transitions.

CREATE TABLE "NotificationDefinitionLifecycleEvent" (
    "id" TEXT NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priorVersion" INTEGER NOT NULL,
    "newVersion" INTEGER NOT NULL,

    CONSTRAINT "NotificationDefinitionLifecycleEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationDefinitionLifecycleEvent_action_check"
        CHECK ("action" IN ('created', 'saved', 'published', 'archived')),
    CONSTRAINT "NotificationDefinitionLifecycleEvent_revision_check"
        CHECK ("revision" > 0),
    CONSTRAINT "NotificationDefinitionLifecycleEvent_version_check"
        CHECK (
            ("action" = 'created' AND "priorVersion" = 0 AND "newVersion" = 1)
            OR (
                "action" <> 'created'
                AND "priorVersion" > 0
                AND "newVersion" = "priorVersion" + 1
            )
        )
);

CREATE UNIQUE INDEX "NotificationDefLifecycle_definitionVersion_key"
    ON "NotificationDefinitionLifecycleEvent"("definitionId", "newVersion");
CREATE INDEX "NotificationDefLifecycle_definitionTime_idx"
    ON "NotificationDefinitionLifecycleEvent"("definitionId", "occurredAt");
CREATE INDEX "NotificationDefLifecycle_actorTime_idx"
    ON "NotificationDefinitionLifecycleEvent"("actorUserId", "occurredAt");
CREATE INDEX "NotificationDefLifecycle_actionTime_idx"
    ON "NotificationDefinitionLifecycleEvent"("action", "occurredAt");

ALTER TABLE "NotificationDefinitionLifecycleEvent"
    ADD CONSTRAINT "NotificationDefinitionLifecycleEvent_definitionId_fkey"
    FOREIGN KEY ("definitionId") REFERENCES "NotificationDefinition"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NotificationDefinitionLifecycleEvent_definitionId_revision_fkey"
    FOREIGN KEY ("definitionId", "revision")
    REFERENCES "NotificationDefinitionRevision"("definitionId", "revision")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NotificationDefinitionLifecycleEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "workspace_reject_notification_definition_lifecycle_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; append a new notification definition lifecycle event instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotificationDefinitionLifecycleEvent_append_only"
BEFORE UPDATE OR DELETE ON "NotificationDefinitionLifecycleEvent"
FOR EACH ROW EXECUTE FUNCTION "workspace_reject_notification_definition_lifecycle_mutation"();

CREATE FUNCTION "workspace_reject_notification_definition_key_mutation"()
RETURNS trigger AS $$
BEGIN
  IF NEW."key" IS DISTINCT FROM OLD."key" THEN
    RAISE EXCEPTION 'NotificationDefinition.key is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotificationDefinition_key_immutable"
BEFORE UPDATE OF "key" ON "NotificationDefinition"
FOR EACH ROW EXECUTE FUNCTION "workspace_reject_notification_definition_key_mutation"();
