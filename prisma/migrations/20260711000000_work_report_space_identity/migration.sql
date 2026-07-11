-- A report belongs to its target space, period, and stage. The submitter is
-- audit metadata and must not split one business report into multiple rows.

-- Keep the most recently submitted/updated snapshot when historical databases
-- contain rows that collapse onto the new business identity.
DELETE FROM "WorkReportItem"
WHERE "reportId" IN (
  SELECT report."id"
  FROM "WorkReport" AS report
  WHERE report."id" <> (
    SELECT canonical."id"
    FROM "WorkReport" AS canonical
    WHERE canonical."targetType" = report."targetType"
      AND canonical."targetId" = report."targetId"
      AND canonical."periodType" = report."periodType"
      AND canonical."periodStart" = report."periodStart"
      AND canonical."reportStage" = report."reportStage"
    ORDER BY
      COALESCE(canonical."submittedAt", canonical."updatedAt", canonical."createdAt") DESC,
      canonical."updatedAt" DESC,
      canonical."id" DESC
    LIMIT 1
  )
);

DELETE FROM "WorkReport"
WHERE "id" <> (
  SELECT canonical."id"
  FROM "WorkReport" AS canonical
  WHERE canonical."targetType" = "WorkReport"."targetType"
    AND canonical."targetId" = "WorkReport"."targetId"
    AND canonical."periodType" = "WorkReport"."periodType"
    AND canonical."periodStart" = "WorkReport"."periodStart"
    AND canonical."reportStage" = "WorkReport"."reportStage"
  ORDER BY
    COALESCE(canonical."submittedAt", canonical."updatedAt", canonical."createdAt") DESC,
    canonical."updatedAt" DESC,
    canonical."id" DESC
  LIMIT 1
);

DROP INDEX IF EXISTS "WorkReport_targetType_targetId_periodType_periodStart_submittedBy_reportStage_key";
DROP INDEX IF EXISTS "WorkReport_targetType_targetId_periodType_periodStart_reportStage_idx";

CREATE UNIQUE INDEX "WorkReport_targetType_targetId_periodType_periodStart_reportStage_key"
ON "WorkReport"("targetType", "targetId", "periodType", "periodStart", "reportStage");
