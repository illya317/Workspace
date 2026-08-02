-- workspace:migration-mode=maintenance

ALTER TABLE "EmployeePosition"
RENAME COLUMN "workPercent" TO "allocationWeight";

UPDATE "EmployeePosition"
SET "allocationWeight" = CASE
  WHEN "allocationWeight" IS NULL OR btrim("allocationWeight") = '' THEN NULL
  WHEN btrim("allocationWeight") ~ '^[0-9]+([.][0-9]+)?%$'
    THEN ((regexp_replace(btrim("allocationWeight"), '%$', ''))::numeric)::text
  WHEN btrim("allocationWeight") ~ '^[0-9]+([.][0-9]+)?$'
    THEN CASE
      WHEN (btrim("allocationWeight"))::numeric <= 1
        THEN ((btrim("allocationWeight"))::numeric * 100)::text
      ELSE ((btrim("allocationWeight"))::numeric)::text
    END
  ELSE "allocationWeight"
END;
