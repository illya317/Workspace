-- Replace legacy hash-based automatic consolidation entry numbers with the
-- period/type/sequence format used by normal accounting vouchers.
UPDATE "FinanceConsolidationEntry"
SET "entryNo" = '__group_voucher_renumber__' || "id"::text
WHERE "entryNo" LIKE 'AUTO-%';

WITH reserved AS (
  SELECT
    "batchId",
    LEFT("postingDate", 7) AS period,
    MAX(SUBSTRING("entryNo" FROM '^[0-9]{4}-[0-9]{2}-合-([0-9]+)$')::integer) AS maximum
  FROM "FinanceConsolidationEntry"
  WHERE "entryNo" ~ '^[0-9]{4}-[0-9]{2}-合-[0-9]+$'
  GROUP BY "batchId", LEFT("postingDate", 7)
),
numbered AS (
  SELECT
    entry."id",
    LEFT(entry."postingDate", 7) AS period,
    COALESCE(reserved.maximum, 0)
      + ROW_NUMBER() OVER (
        PARTITION BY entry."batchId", LEFT(entry."postingDate", 7)
        ORDER BY entry."postingDate", entry."createdAt", entry."id"
      ) AS sequence
  FROM "FinanceConsolidationEntry" AS entry
  LEFT JOIN reserved
    ON reserved."batchId" = entry."batchId"
   AND reserved.period = LEFT(entry."postingDate", 7)
  WHERE entry."entryNo" LIKE '__group_voucher_renumber__%'
)
UPDATE "FinanceConsolidationEntry" AS entry
SET "entryNo" = numbered.period || '-合-' || CASE
  WHEN LENGTH(numbered.sequence::text) >= 4 THEN numbered.sequence::text
  ELSE LPAD(numbered.sequence::text, 4, '0')
END
FROM numbered
WHERE entry."id" = numbered."id";
