-- workspace:migration-mode=expand

UPDATE "NotificationGroupPolicy"
SET "messageTemplate" = '工作汇报提醒' || E'\n\n' || "messageTemplate"
WHERE "weeklyAgentKey" = 'work.weekly-report'
  AND "messageTemplate" IS NOT NULL
  AND split_part("messageTemplate", E'\n', 1) <> '工作汇报提醒';
