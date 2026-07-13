-- Standardize OKR plan ownership to fixed cycles: year / half-year / quarter / month.

UPDATE "WorkPlan"
SET
  "title" = CASE "WorkOkrCycle"."periodType"
    WHEN 'yearly' THEN printf('%d年度OKR计划', "WorkOkrCycle"."year")
    WHEN 'half_year' THEN printf('%d年%s半年OKR计划', "WorkOkrCycle"."year", CASE "WorkOkrCycle"."sequence" WHEN 1 THEN '上' ELSE '下' END)
    WHEN 'quarterly' THEN printf('%d年第%d季度OKR计划', "WorkOkrCycle"."year", "WorkOkrCycle"."sequence")
    WHEN 'monthly' THEN printf('%d年%02d月OKR计划', "WorkOkrCycle"."year", "WorkOkrCycle"."sequence")
    ELSE "WorkPlan"."title"
  END,
  "periodType" = "WorkOkrCycle"."periodType",
  "periodStart" = "WorkOkrCycle"."startDate",
  "periodEnd" = "WorkOkrCycle"."endDate",
  "plannedStartDate" = "WorkOkrCycle"."startDate",
  "plannedEndDate" = "WorkOkrCycle"."endDate"
FROM "WorkOkrCycle"
WHERE "WorkPlan"."okrCycleId" = "WorkOkrCycle"."id"
  AND "WorkPlan"."kind" = 'okr'
  AND "WorkOkrCycle"."periodType" IN ('yearly', 'half_year', 'quarterly', 'monthly');

UPDATE "WorkItem"
SET "planId" = (
  SELECT "standard"."id"
  FROM "WorkPlan" AS "source"
  JOIN "WorkPlan" AS "standard"
    ON "standard"."targetType" = "source"."targetType"
   AND "standard"."targetId" = "source"."targetId"
   AND "standard"."kind" = 'okr'
   AND "standard"."status" <> 'archived'
  JOIN "WorkOkrCycle" AS "cycle"
    ON "cycle"."id" = "standard"."okrCycleId"
   AND "cycle"."periodType" IN ('yearly', 'half_year', 'quarterly', 'monthly')
  WHERE "source"."id" = "WorkItem"."planId"
    AND "source"."kind" = 'okr'
    AND (
      "source"."periodType" IS NULL
      OR "source"."periodType" NOT IN ('yearly', 'half_year', 'quarterly', 'monthly')
      OR "source"."okrCycleId" IS NULL
    )
    AND (
      ("source"."periodType" = 'weekly' AND "source"."periodStart" IS NOT NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodStart"))
      OR ("source"."periodType" IS NOT 'weekly' AND "source"."periodStart" IS NOT NULL AND "source"."periodEnd" IS NOT NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodEnd"))
      OR ("source"."periodType" IS NOT 'weekly' AND "source"."periodStart" IS NOT NULL AND "source"."periodEnd" IS NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodStart"))
      OR ("source"."periodStart" IS NULL AND "cycle"."periodType" = 'yearly' AND "cycle"."year" = 2026)
    )
  ORDER BY julianday("cycle"."endDate") - julianday("cycle"."startDate"), "standard"."id"
  LIMIT 1
)
WHERE "planId" IN (
  SELECT "id"
  FROM "WorkPlan"
  WHERE "kind" = 'okr'
    AND (
      "periodType" IS NULL
      OR "periodType" NOT IN ('yearly', 'half_year', 'quarterly', 'monthly')
      OR "okrCycleId" IS NULL
    )
)
AND (
  SELECT "standard"."id"
  FROM "WorkPlan" AS "source"
  JOIN "WorkPlan" AS "standard"
    ON "standard"."targetType" = "source"."targetType"
   AND "standard"."targetId" = "source"."targetId"
   AND "standard"."kind" = 'okr'
   AND "standard"."status" <> 'archived'
  JOIN "WorkOkrCycle" AS "cycle"
    ON "cycle"."id" = "standard"."okrCycleId"
   AND "cycle"."periodType" IN ('yearly', 'half_year', 'quarterly', 'monthly')
  WHERE "source"."id" = "WorkItem"."planId"
    AND (
      ("source"."periodType" = 'weekly' AND "source"."periodStart" IS NOT NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodStart"))
      OR ("source"."periodType" IS NOT 'weekly' AND "source"."periodStart" IS NOT NULL AND "source"."periodEnd" IS NOT NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodEnd"))
      OR ("source"."periodType" IS NOT 'weekly' AND "source"."periodStart" IS NOT NULL AND "source"."periodEnd" IS NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodStart"))
      OR ("source"."periodStart" IS NULL AND "cycle"."periodType" = 'yearly' AND "cycle"."year" = 2026)
    )
  ORDER BY julianday("cycle"."endDate") - julianday("cycle"."startDate"), "standard"."id"
  LIMIT 1
) IS NOT NULL;

UPDATE "WorkReportItem"
SET "workPlanId" = (
  SELECT "standard"."id"
  FROM "WorkPlan" AS "source"
  JOIN "WorkPlan" AS "standard"
    ON "standard"."targetType" = "source"."targetType"
   AND "standard"."targetId" = "source"."targetId"
   AND "standard"."kind" = 'okr'
   AND "standard"."status" <> 'archived'
  JOIN "WorkOkrCycle" AS "cycle"
    ON "cycle"."id" = "standard"."okrCycleId"
   AND "cycle"."periodType" IN ('yearly', 'half_year', 'quarterly', 'monthly')
  WHERE "source"."id" = "WorkReportItem"."workPlanId"
    AND (
      ("source"."periodType" = 'weekly' AND "source"."periodStart" IS NOT NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodStart"))
      OR ("source"."periodType" IS NOT 'weekly' AND "source"."periodStart" IS NOT NULL AND "source"."periodEnd" IS NOT NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodEnd"))
      OR ("source"."periodType" IS NOT 'weekly' AND "source"."periodStart" IS NOT NULL AND "source"."periodEnd" IS NULL AND date("cycle"."startDate") <= date("source"."periodStart") AND date("cycle"."endDate") >= date("source"."periodStart"))
      OR ("source"."periodStart" IS NULL AND "cycle"."periodType" = 'yearly' AND "cycle"."year" = 2026)
    )
  ORDER BY julianday("cycle"."endDate") - julianday("cycle"."startDate"), "standard"."id"
  LIMIT 1
)
WHERE "workPlanId" IN (
  SELECT "id"
  FROM "WorkPlan"
  WHERE "kind" = 'okr'
    AND (
      "periodType" IS NULL
      OR "periodType" NOT IN ('yearly', 'half_year', 'quarterly', 'monthly')
      OR "okrCycleId" IS NULL
    )
);

DELETE FROM "WorkPlan"
WHERE "kind" = 'okr'
  AND (
    "periodType" IS NULL
    OR "periodType" NOT IN ('yearly', 'half_year', 'quarterly', 'monthly')
    OR "okrCycleId" IS NULL
  )
  AND NOT EXISTS (SELECT 1 FROM "WorkItem" WHERE "WorkItem"."planId" = "WorkPlan"."id");

DELETE FROM "WorkPlan"
WHERE "kind" = 'okr'
  AND "okrCycleId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "WorkItem" WHERE "WorkItem"."planId" = "WorkPlan"."id")
  AND EXISTS (
    SELECT 1
    FROM "WorkPlan" AS "kept"
    WHERE "kept"."id" <> "WorkPlan"."id"
      AND "kept"."targetType" = "WorkPlan"."targetType"
      AND "kept"."targetId" = "WorkPlan"."targetId"
      AND "kept"."kind" = 'okr'
      AND "kept"."okrCycleId" = "WorkPlan"."okrCycleId"
      AND "kept"."status" <> 'archived'
  );
