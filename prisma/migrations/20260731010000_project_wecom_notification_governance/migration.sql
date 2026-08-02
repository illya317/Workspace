-- workspace:migration-mode=maintenance
-- Add project notification governance and a durable managed WeCom delivery outbox.

ALTER TABLE "NotificationDefinition"
    ADD COLUMN "allowProjectMonitoring" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "NotificationDefinitionRevision"
    ADD COLUMN "allowProjectMonitoring" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "NotificationPublication"
    ADD COLUMN "pendingDeliveryCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "deliveredDeliveryCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "failedDeliveryCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "NotificationPublication"
SET "deliveredDeliveryCount" = "deliveryCount";

ALTER TABLE "NotificationPublication"
    DROP CONSTRAINT "NotificationPublication_status_check",
    DROP CONSTRAINT "NotificationPublication_counts_check",
    ADD CONSTRAINT "NotificationPublication_status_check"
        CHECK ("status" IN ('committed', 'processing', 'partial', 'failed', 'delivered')),
    ADD CONSTRAINT "NotificationPublication_counts_check"
        CHECK (
            "recipientCount" >= 0
            AND "deliveryCount" >= 0
            AND "pendingDeliveryCount" >= 0
            AND "deliveredDeliveryCount" >= 0
            AND "failedDeliveryCount" >= 0
            AND "deliveryCount" = (
                "pendingDeliveryCount"
                + "deliveredDeliveryCount"
                + "failedDeliveryCount"
            )
        );

CREATE TABLE "NotificationChannelEndpoint" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "runtimeBindingKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorSummary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationChannelEndpoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationChannelEndpoint_channel_check"
        CHECK ("channel" IN ('wecom')),
    CONSTRAINT "NotificationChannelEndpoint_status_check"
        CHECK ("status" IN ('active', 'disabled')),
    CONSTRAINT "NotificationChannelEndpoint_healthStatus_check"
        CHECK ("healthStatus" IN ('unknown', 'healthy', 'degraded', 'failing', 'disconnected')),
    CONSTRAINT "NotificationChannelEndpoint_version_check"
        CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "NotificationChannelEndpoint_key_key"
    ON "NotificationChannelEndpoint"("key");
CREATE UNIQUE INDEX "NotificationChannelEndpoint_runtimeBindingKey_key"
    ON "NotificationChannelEndpoint"("runtimeBindingKey");
CREATE INDEX "NotificationChannelEndpoint_channel_status_idx"
    ON "NotificationChannelEndpoint"("channel", "status");
CREATE INDEX "NotificationChannelEndpoint_healthStatus_lastHeartbeatAt_idx"
    ON "NotificationChannelEndpoint"("healthStatus", "lastHeartbeatAt");

ALTER TABLE "NotificationDelivery"
    ADD COLUMN "endpointId" INTEGER,
    ADD COLUMN "destination" TEXT,
    ADD COLUMN "title" TEXT,
    ADD COLUMN "body" TEXT,
    ADD COLUMN "href" TEXT,
    ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
    ADD COLUMN "leaseToken" TEXT,
    ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
    ADD COLUMN "deliveredAt" TIMESTAMP(3),
    ADD COLUMN "failedAt" TIMESTAMP(3),
    ADD COLUMN "lastErrorCode" TEXT,
    ADD COLUMN "lastErrorSummary" TEXT,
    ADD COLUMN "providerMessageId" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "NotificationDelivery" AS delivery
SET
    "destination" = delivery."recipientUsername",
    "title" = notification."title",
    "body" = notification."body",
    "href" = notification."href",
    "deliveredAt" = delivery."createdAt"
FROM "Notification" AS notification
WHERE delivery."notificationId" = notification."id";

ALTER TABLE "NotificationDelivery"
    DROP CONSTRAINT "NotificationDelivery_channel_check",
    DROP CONSTRAINT "NotificationDelivery_status_check",
    ADD CONSTRAINT "NotificationDelivery_channel_check"
        CHECK ("channel" IN ('workspace', 'wecom')),
    ADD CONSTRAINT "NotificationDelivery_status_check"
        CHECK ("status" IN ('pending', 'leased', 'delivered', 'retrying', 'failed')),
    ADD CONSTRAINT "NotificationDelivery_attemptCount_check"
        CHECK ("attemptCount" >= 0),
    ADD CONSTRAINT "NotificationDelivery_lease_check"
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
    ADD CONSTRAINT "NotificationDelivery_channel_state_check"
        CHECK (
            (
                "channel" = 'workspace'
                AND "endpointId" IS NULL
                AND "status" = 'delivered'
            )
            OR
            (
                "channel" = 'wecom'
                AND "endpointId" IS NOT NULL
            )
        );

CREATE UNIQUE INDEX "NotificationDelivery_leaseToken_key"
    ON "NotificationDelivery"("leaseToken");
CREATE INDEX "NotificationDelivery_channel_status_nextAttemptAt_idx"
    ON "NotificationDelivery"("channel", "status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_endpointId_status_nextAttemptAt_idx"
    ON "NotificationDelivery"("endpointId", "status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_leaseExpiresAt_idx"
    ON "NotificationDelivery"("leaseExpiresAt");

ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_endpointId_fkey"
    FOREIGN KEY ("endpointId") REFERENCES "NotificationChannelEndpoint"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "NotificationDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" INTEGER NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "resultFingerprint" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationDeliveryAttempt_attemptNo_check"
        CHECK ("attemptNo" > 0),
    CONSTRAINT "NotificationDeliveryAttempt_outcome_check"
        CHECK ("outcome" IN ('delivered', 'retrying', 'failed')),
    CONSTRAINT "NotificationDeliveryAttempt_fingerprint_check"
        CHECK ("resultFingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "NotificationDeliveryAttempt_outcome_createdAt_idx"
    ON "NotificationDeliveryAttempt"("outcome", "createdAt");
CREATE UNIQUE INDEX "NotificationDeliveryAttempt_deliveryId_attemptNo_key"
    ON "NotificationDeliveryAttempt"("deliveryId", "attemptNo");

ALTER TABLE "NotificationDeliveryAttempt"
    ADD CONSTRAINT "NotificationDeliveryAttempt_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationDeliveryWorkerRequest" (
    "id" TEXT NOT NULL,
    "endpointId" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseJson" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryWorkerRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationDeliveryWorkerRequest_status_check"
        CHECK ("responseStatus" BETWEEN 100 AND 599),
    CONSTRAINT "NotificationDeliveryWorkerRequest_fingerprint_check"
        CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "NotificationDeliveryWorkerRequest_response_check"
        CHECK (jsonb_typeof("responseJson"::jsonb) = 'object'),
    CONSTRAINT "NotificationDeliveryWorkerRequest_expiry_check"
        CHECK ("expiresAt" > "createdAt")
);

CREATE INDEX "NotificationDeliveryWorkerRequest_expiresAt_idx"
    ON "NotificationDeliveryWorkerRequest"("expiresAt");
CREATE UNIQUE INDEX "NotificationDeliveryWorkerRequest_endpointId_requestId_key"
    ON "NotificationDeliveryWorkerRequest"("endpointId", "requestId");

ALTER TABLE "NotificationDeliveryWorkerRequest"
    ADD CONSTRAINT "NotificationDeliveryWorkerRequest_endpointId_fkey"
    FOREIGN KEY ("endpointId") REFERENCES "NotificationChannelEndpoint"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectNotificationRule" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "conditionJson" TEXT NOT NULL,
    "audiencePolicyJson" TEXT NOT NULL,
    "channelPolicyJson" TEXT NOT NULL,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER NOT NULL,
    "publishedByUserId" INTEGER,
    "archivedByUserId" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotificationRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectNotificationRule_key_check"
        CHECK ("key" ~ '^[a-z][a-z0-9]*([._-][a-z0-9]+)*$'),
    CONSTRAINT "ProjectNotificationRule_definitionKey_check"
        CHECK ("definitionKey" ~ '^custom\.[a-z][a-z0-9]*([._-][a-z0-9]+)*$'),
    CONSTRAINT "ProjectNotificationRule_eventType_check"
        CHECK ("eventType" IN (
            'project.updated',
            'project.archived',
            'project.restored',
            'project.scheduled'
        )),
    CONSTRAINT "ProjectNotificationRule_condition_check"
        CHECK (jsonb_typeof("conditionJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationRule_audience_check"
        CHECK (jsonb_typeof("audiencePolicyJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationRule_channel_check"
        CHECK (jsonb_typeof("channelPolicyJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationRule_cooldown_check"
        CHECK ("cooldownSeconds" BETWEEN 0 AND 31536000),
    CONSTRAINT "ProjectNotificationRule_status_check"
        CHECK ("status" IN ('draft', 'published', 'archived')),
    CONSTRAINT "ProjectNotificationRule_revision_check"
        CHECK ("revision" > 0),
    CONSTRAINT "ProjectNotificationRule_publishedRevision_check"
        CHECK (
            "publishedRevision" IS NULL
            OR (
                "publishedRevision" > 0
                AND "publishedRevision" <= "revision"
            )
        ),
    CONSTRAINT "ProjectNotificationRule_version_check"
        CHECK ("version" > 0)
);

CREATE INDEX "ProjectNotificationRule_projectId_status_eventType_idx"
    ON "ProjectNotificationRule"("projectId", "status", "eventType");
CREATE INDEX "ProjectNotificationRule_definitionKey_idx"
    ON "ProjectNotificationRule"("definitionKey");
CREATE UNIQUE INDEX "ProjectNotificationRule_projectId_key_key"
    ON "ProjectNotificationRule"("projectId", "key");

ALTER TABLE "ProjectNotificationRule"
    ADD CONSTRAINT "ProjectNotificationRule_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationRule_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationRule_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationRule_publishedByUserId_fkey"
    FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationRule_archivedByUserId_fkey"
    FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProjectNotificationRuleRevision" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "conditionJson" TEXT NOT NULL,
    "conditionFingerprint" TEXT NOT NULL,
    "audiencePolicyJson" TEXT NOT NULL,
    "channelPolicyJson" TEXT NOT NULL,
    "cooldownSeconds" INTEGER NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotificationRuleRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectNotificationRuleRevision_eventType_check"
        CHECK ("eventType" IN (
            'project.updated',
            'project.archived',
            'project.restored',
            'project.scheduled'
        )),
    CONSTRAINT "ProjectNotificationRuleRevision_condition_check"
        CHECK (jsonb_typeof("conditionJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationRuleRevision_audience_check"
        CHECK (jsonb_typeof("audiencePolicyJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationRuleRevision_channel_check"
        CHECK (jsonb_typeof("channelPolicyJson"::jsonb) = 'object'),
    CONSTRAINT "ProjectNotificationRuleRevision_revision_check"
        CHECK ("revision" > 0),
    CONSTRAINT "ProjectNotificationRuleRevision_cooldown_check"
        CHECK ("cooldownSeconds" BETWEEN 0 AND 31536000),
    CONSTRAINT "ProjectNotificationRuleRevision_fingerprint_check"
        CHECK ("conditionFingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "ProjectNotificationRuleRevision_createdByUserId_idx"
    ON "ProjectNotificationRuleRevision"("createdByUserId");
CREATE UNIQUE INDEX "ProjectNotificationRuleRevision_ruleId_revision_key"
    ON "ProjectNotificationRuleRevision"("ruleId", "revision");

ALTER TABLE "ProjectNotificationRuleRevision"
    ADD CONSTRAINT "ProjectNotificationRuleRevision_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "ProjectNotificationRule"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationRuleRevision_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProjectNotificationEvaluation" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "ruleRevision" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "signalKind" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "factsFingerprint" TEXT NOT NULL,
    "publicationId" TEXT,
    "errorCode" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotificationEvaluation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectNotificationEvaluation_revision_check"
        CHECK ("ruleRevision" > 0),
    CONSTRAINT "ProjectNotificationEvaluation_signalKind_check"
        CHECK ("signalKind" IN (
            'project.updated',
            'project.archived',
            'project.restored',
            'project.scheduled'
        )),
    CONSTRAINT "ProjectNotificationEvaluation_outcome_check"
        CHECK ("outcome" IN (
            'published',
            'condition_not_matched',
            'cooldown',
            'no_recipients',
            'error'
        )),
    CONSTRAINT "ProjectNotificationEvaluation_fingerprint_check"
        CHECK ("factsFingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "ProjectNotificationEvaluation_projectId_evaluatedAt_idx"
    ON "ProjectNotificationEvaluation"("projectId", "evaluatedAt");
CREATE INDEX "ProjectNotificationEvaluation_ruleId_outcome_evaluatedAt_idx"
    ON "ProjectNotificationEvaluation"("ruleId", "outcome", "evaluatedAt");
CREATE INDEX "ProjectNotificationEvaluation_publicationId_idx"
    ON "ProjectNotificationEvaluation"("publicationId");
CREATE UNIQUE INDEX "ProjectNotificationEvaluation_ruleId_signalKind_signalId_key"
    ON "ProjectNotificationEvaluation"("ruleId", "signalKind", "signalId");

ALTER TABLE "ProjectNotificationEvaluation"
    ADD CONSTRAINT "ProjectNotificationEvaluation_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "ProjectNotificationRule"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectNotificationEvaluation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
