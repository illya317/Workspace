ALTER TABLE "WorkPlan" ADD COLUMN "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WorkPlan"
SET "isSystemGenerated" = true
FROM "WorkOkrCycle"
WHERE "WorkPlan"."kind" = 'okr'
  AND "WorkPlan"."okrCycleId" = "WorkOkrCycle"."id"
  AND "WorkOkrCycle"."periodType" IN ('yearly', 'half_year', 'quarterly', 'monthly')
  AND date("WorkPlan"."periodStart") = date("WorkOkrCycle"."startDate")
  AND date("WorkPlan"."periodEnd") = date("WorkOkrCycle"."endDate")
  AND date("WorkPlan"."plannedStartDate") = date("WorkOkrCycle"."startDate")
  AND date("WorkPlan"."plannedEndDate") = date("WorkOkrCycle"."endDate")
  AND "WorkPlan"."title" = CASE "WorkOkrCycle"."periodType"
    WHEN 'yearly' THEN printf('%d年度OKR计划', "WorkOkrCycle"."year")
    WHEN 'half_year' THEN printf('%d年%s半年OKR计划', "WorkOkrCycle"."year", CASE "WorkOkrCycle"."sequence" WHEN 1 THEN '上' ELSE '下' END)
    WHEN 'quarterly' THEN printf('%d年第%d季度OKR计划', "WorkOkrCycle"."year", "WorkOkrCycle"."sequence")
    WHEN 'monthly' THEN printf('%d年%02d月OKR计划', "WorkOkrCycle"."year", "WorkOkrCycle"."sequence")
    ELSE "WorkPlan"."title"
  END;
