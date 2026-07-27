UPDATE "Notification"
SET "type" = 'platform.businessData.alert'
WHERE "type" = 'platform.dataQuality.alert';

UPDATE "NotificationSubscription"
SET "eventKey" = 'platform.businessData.alert'
WHERE "eventKey" = 'platform.dataQuality.alert';
