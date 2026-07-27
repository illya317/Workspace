-- workspace:migration-mode=maintenance
-- Split the former umbrella preference into the four concrete HR inspection events.

INSERT INTO "NotificationSubscription" (
    "userId",
    "eventKey",
    "enabled",
    "channel",
    "cadence",
    "createdAt",
    "updatedAt"
)
SELECT
    subscription."userId",
    event."eventKey",
    subscription."enabled",
    subscription."channel",
    subscription."cadence",
    subscription."createdAt",
    CURRENT_TIMESTAMP
FROM "NotificationSubscription" AS subscription
CROSS JOIN (VALUES
    ('hr.active-employment.unique'),
    ('hr.active-employee.current-assignment'),
    ('hr.current-assignment.organization-complete'),
    ('hr.current-assignment.workload-total')
) AS event("eventKey")
WHERE subscription."eventKey" = 'platform.businessData.alert'
ON CONFLICT ("userId", "eventKey", "channel") DO UPDATE SET
    "enabled" = EXCLUDED."enabled",
    "cadence" = EXCLUDED."cadence",
    "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "NotificationSubscription"
WHERE "eventKey" = 'platform.businessData.alert';
