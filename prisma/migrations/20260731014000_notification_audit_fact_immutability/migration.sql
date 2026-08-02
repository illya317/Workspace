-- workspace:migration-mode=maintenance
-- Enforce append-only notification audit facts without rewriting historical rows.

CREATE OR REPLACE FUNCTION "reject_notification_audit_fact_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is forbidden', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "NotificationDefinitionRevision_append_only"
BEFORE UPDATE OR DELETE ON "NotificationDefinitionRevision"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "NotificationDefinitionRevision_no_truncate"
BEFORE TRUNCATE ON "NotificationDefinitionRevision"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE TRIGGER "NotificationDefinitionLifecycleEvent_no_truncate"
BEFORE TRUNCATE ON "NotificationDefinitionLifecycleEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE TRIGGER "NotificationDeliveryAttempt_append_only"
BEFORE UPDATE OR DELETE ON "NotificationDeliveryAttempt"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "NotificationDeliveryAttempt_no_truncate"
BEFORE TRUNCATE ON "NotificationDeliveryAttempt"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE TRIGGER "ProjectNotificationRuleRevision_append_only"
BEFORE UPDATE OR DELETE ON "ProjectNotificationRuleRevision"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "ProjectNotificationRuleRevision_no_truncate"
BEFORE TRUNCATE ON "ProjectNotificationRuleRevision"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE TRIGGER "ProjectNotificationRuleLifecycleEvent_append_only"
BEFORE UPDATE OR DELETE ON "ProjectNotificationRuleLifecycleEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "ProjectNotificationRuleLifecycleEvent_no_truncate"
BEFORE TRUNCATE ON "ProjectNotificationRuleLifecycleEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE TRIGGER "ProjectNotificationEvaluation_append_only"
BEFORE UPDATE OR DELETE ON "ProjectNotificationEvaluation"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "ProjectNotificationEvaluation_no_truncate"
BEFORE TRUNCATE ON "ProjectNotificationEvaluation"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();

CREATE TRIGGER "ProjectNotificationSignalRedriveEvent_append_only"
BEFORE UPDATE OR DELETE ON "ProjectNotificationSignalRedriveEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
CREATE TRIGGER "ProjectNotificationSignalRedriveEvent_no_truncate"
BEFORE TRUNCATE ON "ProjectNotificationSignalRedriveEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_notification_audit_fact_mutation"();
