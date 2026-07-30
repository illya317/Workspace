-- workspace:migration-mode=maintenance
-- Persist Work project notification signals before commit and bind evaluations to immutable revisions.

CREATE TABLE "ProjectNotificationSignal" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "projectVersion" INTEGER NOT NULL,
    "signalKind" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "changedField" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "factsFingerprint" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotificationSignal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectNotificationSignal_projectVersion_check"
        CHECK ("projectVersion" > 0),
    CONSTRAINT "ProjectNotificationSignal_signalKind_check"
        CHECK ("signalKind" IN (
            'project.updated',
            'project.archived',
            'project.restored',
            'project.scheduled'
        )),
    CONSTRAINT "ProjectNotificationSignal_signalId_check"
        CHECK ("signalId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
    CONSTRAINT "ProjectNotificationSignal_changedField_check"
        CHECK ("changedField" ~ '^[A-Za-z][A-Za-z0-9._-]{0,119}$'),
    CONSTRAINT "ProjectNotificationSignal_snapshot_check"
        CHECK (jsonb_typeof("snapshotJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationSignal_fingerprint_check"
        CHECK ("factsFingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ProjectNotificationSignal_status_check"
        CHECK ("status" IN ('pending', 'leased', 'retrying', 'completed', 'failed')),
    CONSTRAINT "ProjectNotificationSignal_attemptCount_check"
        CHECK ("attemptCount" >= 0),
    CONSTRAINT "ProjectNotificationSignal_lease_check"
        CHECK (
            (
                "status" = 'leased'
                AND "leaseToken" IS NOT NULL
                AND "leaseExpiresAt" IS NOT NULL
            )
            OR
            (
                "status" <> 'leased'
                AND "leaseToken" IS NULL
                AND "leaseExpiresAt" IS NULL
            )
        ),
    CONSTRAINT "ProjectNotificationSignal_terminal_check"
        CHECK (
            ("status" = 'completed' AND "processedAt" IS NOT NULL AND "failedAt" IS NULL)
            OR ("status" = 'failed' AND "failedAt" IS NOT NULL AND "processedAt" IS NULL)
            OR ("status" IN ('pending', 'leased', 'retrying') AND "processedAt" IS NULL AND "failedAt" IS NULL)
        )
);

CREATE TABLE "ProjectNotificationRuleLifecycleEvent" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priorVersion" INTEGER NOT NULL,
    "newVersion" INTEGER NOT NULL,

    CONSTRAINT "ProjectNotificationRuleLifecycleEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectNotificationRuleLifecycleEvent_action_check"
        CHECK ("action" IN ('published', 'archived')),
    CONSTRAINT "ProjectNotificationRuleLifecycleEvent_revision_check"
        CHECK ("revision" > 0),
    CONSTRAINT "ProjectNotificationRuleLifecycleEvent_version_check"
        CHECK ("priorVersion" > 0 AND "newVersion" = "priorVersion" + 1)
);

CREATE INDEX "ProjNotifyRuleLifecycle_rule_time_idx"
    ON "ProjectNotificationRuleLifecycleEvent"("ruleId", "occurredAt");
CREATE UNIQUE INDEX "ProjNotifyRuleLifecycle_rule_version_key"
    ON "ProjectNotificationRuleLifecycleEvent"("ruleId", "newVersion");
CREATE INDEX "ProjNotifyRuleLifecycle_actor_time_idx"
    ON "ProjectNotificationRuleLifecycleEvent"("actorUserId", "occurredAt");

ALTER TABLE "ProjectNotificationRuleLifecycleEvent"
    ADD CONSTRAINT "ProjectNotificationRuleLifecycleEvent_ruleId_revision_fkey"
    FOREIGN KEY ("ruleId", "revision")
    REFERENCES "ProjectNotificationRuleRevision"("ruleId", "revision")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationRuleLifecycleEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProjNotifyRule_id_project_key"
    ON "ProjectNotificationRule"("id", "projectId");

CREATE TABLE "ProjectNotificationPublicationIntent" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "ruleRevision" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "signalKind" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'publishing',
    "publicationId" TEXT,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotificationPublicationIntent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectNotificationPublicationIntent_revision_check"
        CHECK ("ruleRevision" > 0),
    CONSTRAINT "ProjectNotificationPublicationIntent_signalKind_check"
        CHECK ("signalKind" IN (
            'project.updated',
            'project.archived',
            'project.restored',
            'project.scheduled'
        )),
    CONSTRAINT "ProjectNotificationPublicationIntent_request_check"
        CHECK (jsonb_typeof("requestJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationPublicationIntent_fingerprint_check"
        CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ProjectNotificationPublicationIntent_status_check"
        CHECK ("status" IN ('publishing', 'committed', 'failed')),
    CONSTRAINT "ProjectNotificationPublicationIntent_state_check"
        CHECK (
            (
                "status" = 'publishing'
                AND "publicationId" IS NULL
                AND "committedAt" IS NULL
                AND "failedAt" IS NULL
            )
            OR (
                "status" = 'committed'
                AND "publicationId" IS NOT NULL
                AND "committedAt" IS NOT NULL
                AND "failedAt" IS NULL
            )
            OR (
                "status" = 'failed'
                AND "publicationId" IS NULL
                AND "committedAt" IS NULL
                AND "failedAt" IS NOT NULL
            )
        )
);

CREATE UNIQUE INDEX "ProjNotifyIntent_publication_key"
    ON "ProjectNotificationPublicationIntent"("publicationId");
CREATE UNIQUE INDEX "ProjNotifyIntent_rule_signal_key"
    ON "ProjectNotificationPublicationIntent"("ruleId", "signalKind", "signalId");
CREATE UNIQUE INDEX "ProjNotifyIntent_project_idempotency_key"
    ON "ProjectNotificationPublicationIntent"("projectId", "idempotencyKey");
CREATE INDEX "ProjNotifyIntent_rule_status_time_idx"
    ON "ProjectNotificationPublicationIntent"("ruleId", "status", "preparedAt");
CREATE INDEX "ProjNotifyIntent_project_time_idx"
    ON "ProjectNotificationPublicationIntent"("projectId", "preparedAt");

ALTER TABLE "ProjectNotificationPublicationIntent"
    ADD CONSTRAINT "ProjectNotificationPublicationIntent_ruleId_projectId_fkey"
    FOREIGN KEY ("ruleId", "projectId")
    REFERENCES "ProjectNotificationRule"("id", "projectId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationPublicationIntent_ruleId_ruleRevision_fkey"
    FOREIGN KEY ("ruleId", "ruleRevision")
    REFERENCES "ProjectNotificationRuleRevision"("ruleId", "revision")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationPublicationIntent_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationPublicationIntent_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "NotificationPublication"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProjNotifySignal_signal_key"
    ON "ProjectNotificationSignal"("signalId");
CREATE UNIQUE INDEX "ProjNotifySignal_lease_key"
    ON "ProjectNotificationSignal"("leaseToken");
CREATE INDEX "ProjNotifySignal_status_due_idx"
    ON "ProjectNotificationSignal"("status", "nextAttemptAt");
CREATE INDEX "ProjNotifySignal_lease_expiry_idx"
    ON "ProjectNotificationSignal"("leaseExpiresAt");
CREATE INDEX "ProjNotifySignal_project_time_idx"
    ON "ProjectNotificationSignal"("projectId", "createdAt");

ALTER TABLE "ProjectNotificationSignal"
    ADD CONSTRAINT "ProjectNotificationSignal_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProjectNotificationSignalRedriveEvent" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sourceSignalRecordId" TEXT NOT NULL,
    "redriveSignalRecordId" TEXT NOT NULL,
    "sourceAttemptCount" INTEGER NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotificationSignalRedriveEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectNotifyRedrive_attempt_check" CHECK ("sourceAttemptCount" > 0),
    CONSTRAINT "ProjectNotifyRedrive_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX "ProjectNotifyRedrive_childSignal_key"
    ON "ProjectNotificationSignalRedriveEvent"("redriveSignalRecordId");
CREATE UNIQUE INDEX "ProjectNotifyRedrive_sourceAttempt_key"
    ON "ProjectNotificationSignalRedriveEvent"("sourceSignalRecordId", "sourceAttemptCount");
CREATE INDEX "ProjectNotifyRedrive_project_time_idx"
    ON "ProjectNotificationSignalRedriveEvent"("projectId", "occurredAt");
CREATE INDEX "ProjectNotifyRedrive_actor_time_idx"
    ON "ProjectNotificationSignalRedriveEvent"("actorUserId", "occurredAt");

ALTER TABLE "ProjectNotificationSignalRedriveEvent"
    ADD CONSTRAINT "ProjectNotifyRedrive_project_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotifyRedrive_sourceSignal_fkey"
    FOREIGN KEY ("sourceSignalRecordId") REFERENCES "ProjectNotificationSignal"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotifyRedrive_childSignal_fkey"
    FOREIGN KEY ("redriveSignalRecordId") REFERENCES "ProjectNotificationSignal"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotifyRedrive_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectNotificationEvaluation"
    DROP CONSTRAINT "ProjectNotificationEvaluation_ruleId_fkey",
    ADD CONSTRAINT "ProjectNotificationEvaluation_ruleId_projectId_fkey"
    FOREIGN KEY ("ruleId", "projectId")
    REFERENCES "ProjectNotificationRule"("id", "projectId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationEvaluation_ruleId_ruleRevision_fkey"
    FOREIGN KEY ("ruleId", "ruleRevision")
    REFERENCES "ProjectNotificationRuleRevision"("ruleId", "revision")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationEvaluation_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "NotificationPublication"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NotificationPublication"
    ADD CONSTRAINT "NotificationPublication_definitionId_definitionRevision_fkey"
    FOREIGN KEY ("definitionId", "definitionRevision")
    REFERENCES "NotificationDefinitionRevision"("definitionId", "revision")
    ON DELETE RESTRICT ON UPDATE CASCADE;
