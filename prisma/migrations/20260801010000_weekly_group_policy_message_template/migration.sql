-- workspace:migration-mode=expand

ALTER TABLE "NotificationGroupPolicy"
ADD COLUMN "messageTemplate" TEXT;

UPDATE "NotificationGroupPolicy" AS policy
SET "messageTemplate" = $message${{salutation}}

{{meeting_date}}召开{{meeting_type}}，请在新系统中完成{{report_period}}的填报（{{period_range}}），谢谢！

部门/项目负责人请先在顶部「工作空间」切换至本人负责的部门或项目空间，再选择「工作汇报 → {{report_tab}}」。
负责多个空间的，请逐一切换并填报；如未显示对应空间，请先在「个人设置」中配置「常用部门/常用项目」。
手机端如提示扫码登录，可先截图，再从相册中识别二维码。$message$
WHERE policy."weeklyAgentKey" = 'work.weekly-report'
  AND policy."scheduleJson"::jsonb ->> 'mode' = 'weekly';
