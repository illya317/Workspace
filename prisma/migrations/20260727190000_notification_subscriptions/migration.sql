-- workspace:migration-mode=maintenance
-- Add normalized personal notification subscriptions and immutable delivery-reason snapshots.

CREATE TABLE "NotificationSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channel" TEXT NOT NULL DEFAULT 'workspace',
    "cadence" TEXT NOT NULL DEFAULT 'immediate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationSubscription_channel_check" CHECK ("channel" IN ('workspace')),
    CONSTRAINT "NotificationSubscription_cadence_check" CHECK ("cadence" IN ('immediate'))
);

CREATE UNIQUE INDEX "NotificationSubscription_userId_eventKey_channel_key"
    ON "NotificationSubscription"("userId", "eventKey", "channel");
CREATE INDEX "NotificationSubscription_eventKey_enabled_idx"
    ON "NotificationSubscription"("eventKey", "enabled");

ALTER TABLE "NotificationSubscription"
    ADD CONSTRAINT "NotificationSubscription_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
    ADD COLUMN "recipientReason" TEXT,
    ADD COLUMN "resourceKey" TEXT,
    ADD COLUMN "scopeId" TEXT,
    ADD COLUMN "subscriptionId" INTEGER;

UPDATE "Notification"
SET
    "recipientReason" = CASE "type"
      WHEN 'work.department.collaboration.invited' THEN '你是该部门协作责任范围的成员'
      WHEN 'work.project.member.added' THEN '你是本次项目成员变更的直接对象'
      WHEN 'work.project.member.roleChanged' THEN '你是本次项目角色变更的直接对象'
      WHEN 'approval.request.submitted' THEN '你是当前流程处理人'
      WHEN 'approval.request.rejected' THEN '你是该流程的发起人或相关参与人'
      WHEN 'approval.request.approved' THEN '你是该流程的发起人或相关参与人'
      WHEN 'approval.request.commented' THEN '你是该流程的相关参与人'
      WHEN 'security.permissionReview.alert' THEN '你是系统配置的安全治理责任人'
      WHEN 'platform.dataQuality.alert' THEN '系统管理员为此业务范围配置了提醒'
      ELSE NULL
    END,
    "resourceKey" = CASE "type"
      WHEN 'work.department.collaboration.invited' THEN 'work.tasks'
      WHEN 'work.project.member.added' THEN 'work.projects'
      WHEN 'work.project.member.roleChanged' THEN 'work.projects'
      WHEN 'security.permissionReview.alert' THEN 'settings.admin'
      ELSE NULL
    END
WHERE "recipientReason" IS NULL;

CREATE INDEX "Notification_resourceKey_createdAt_idx"
    ON "Notification"("resourceKey", "createdAt");
CREATE INDEX "Notification_subscriptionId_idx"
    ON "Notification"("subscriptionId");

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_subscriptionId_fkey"
        FOREIGN KEY ("subscriptionId") REFERENCES "NotificationSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
