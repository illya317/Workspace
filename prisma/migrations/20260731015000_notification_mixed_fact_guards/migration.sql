-- workspace:migration-mode=maintenance
-- Freeze the identity and request snapshots of notification state-machine facts.
-- Operational result columns remain mutable so delivery and queue workers can advance state.

CREATE FUNCTION "reject_notification_definition_stable_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(NEW."createdByUserId", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."createdByUserId", OLD."createdAt") THEN
    RAISE EXCEPTION 'NotificationDefinition creator and creation time are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NotificationDefinition_stable_identity"
BEFORE UPDATE ON "NotificationDefinition"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_definition_stable_identity"();

CREATE FUNCTION "reject_project_notification_rule_stable_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(NEW."projectId", NEW."key", NEW."createdByUserId", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."projectId", OLD."key", OLD."createdByUserId", OLD."createdAt") THEN
    RAISE EXCEPTION 'ProjectNotificationRule project, key, creator and creation time are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectNotificationRule_stable_identity"
BEFORE UPDATE ON "ProjectNotificationRule"
FOR EACH ROW EXECUTE FUNCTION "reject_project_notification_rule_stable_identity"();

CREATE FUNCTION "reject_notification_publication_frozen_columns"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."definitionId", NEW."definitionKey", NEW."definitionRevision",
    NEW."sourceKind", NEW."sourceId", NEW."sourceLabel", NEW."idempotencyKey",
    NEW."fingerprint", NEW."audienceJson", NEW."recipientCount", NEW."deliveryCount",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."definitionId", OLD."definitionKey", OLD."definitionRevision",
    OLD."sourceKind", OLD."sourceId", OLD."sourceLabel", OLD."idempotencyKey",
    OLD."fingerprint", OLD."audienceJson", OLD."recipientCount", OLD."deliveryCount",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'NotificationPublication identity and request snapshot columns are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NotificationPublication_frozen_columns"
BEFORE UPDATE ON "NotificationPublication"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_publication_frozen_columns"();
CREATE TRIGGER "NotificationPublication_no_delete"
BEFORE DELETE ON "NotificationPublication"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "NotificationPublication_no_truncate"
BEFORE TRUNCATE ON "NotificationPublication"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE FUNCTION "reject_notification_delivery_frozen_columns"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."publicationId", NEW."recipientUsername", NEW."channel",
    NEW."endpointId", NEW."destination", NEW."title", NEW."body", NEW."href",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."publicationId", OLD."recipientUsername", OLD."channel",
    OLD."endpointId", OLD."destination", OLD."title", OLD."body", OLD."href",
    OLD."createdAt"
  ) OR (
    NEW."recipientUserId" IS DISTINCT FROM OLD."recipientUserId"
    AND NOT (OLD."recipientUserId" IS NOT NULL AND NEW."recipientUserId" IS NULL)
  ) OR (
    NEW."notificationId" IS DISTINCT FROM OLD."notificationId"
    AND NOT (OLD."notificationId" IS NOT NULL AND NEW."notificationId" IS NULL)
  ) THEN
    RAISE EXCEPTION 'NotificationDelivery identity and payload snapshot columns are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NotificationDelivery_frozen_columns"
BEFORE UPDATE ON "NotificationDelivery"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_delivery_frozen_columns"();
CREATE TRIGGER "NotificationDelivery_no_delete"
BEFORE DELETE ON "NotificationDelivery"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "NotificationDelivery_no_truncate"
BEFORE TRUNCATE ON "NotificationDelivery"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE FUNCTION "reject_project_notification_intent_frozen_columns"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."ruleId", NEW."ruleRevision", NEW."projectId", NEW."signalKind",
    NEW."signalId", NEW."definitionKey", NEW."idempotencyKey", NEW."requestJson",
    NEW."requestFingerprint", NEW."preparedAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."ruleId", OLD."ruleRevision", OLD."projectId", OLD."signalKind",
    OLD."signalId", OLD."definitionKey", OLD."idempotencyKey", OLD."requestJson",
    OLD."requestFingerprint", OLD."preparedAt"
  ) THEN
    RAISE EXCEPTION 'ProjectNotificationPublicationIntent identity and request snapshot columns are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectNotificationPublicationIntent_frozen_columns"
BEFORE UPDATE ON "ProjectNotificationPublicationIntent"
FOR EACH ROW EXECUTE FUNCTION "reject_project_notification_intent_frozen_columns"();
CREATE TRIGGER "ProjectNotificationPublicationIntent_no_delete"
BEFORE DELETE ON "ProjectNotificationPublicationIntent"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "ProjectNotificationPublicationIntent_no_truncate"
BEFORE TRUNCATE ON "ProjectNotificationPublicationIntent"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE FUNCTION "reject_project_notification_signal_frozen_columns"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."projectId", NEW."projectVersion", NEW."signalKind", NEW."signalId",
    NEW."changedField", NEW."snapshotJson", NEW."factsFingerprint", NEW."occurredAt",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."projectId", OLD."projectVersion", OLD."signalKind", OLD."signalId",
    OLD."changedField", OLD."snapshotJson", OLD."factsFingerprint", OLD."occurredAt",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'ProjectNotificationSignal identity and event snapshot columns are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectNotificationSignal_frozen_columns"
BEFORE UPDATE ON "ProjectNotificationSignal"
FOR EACH ROW EXECUTE FUNCTION "reject_project_notification_signal_frozen_columns"();
CREATE TRIGGER "ProjectNotificationSignal_no_delete"
BEFORE DELETE ON "ProjectNotificationSignal"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "ProjectNotificationSignal_no_truncate"
BEFORE TRUNCATE ON "ProjectNotificationSignal"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
