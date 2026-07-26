-- workspace:migration-mode=maintenance
-- Contract P0: normalized master data, explicit legacy evidence and safe lifecycle fields.

CREATE TABLE "ContractCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractCategory_name_key" ON "ContractCategory"("name");
CREATE INDEX "ContractCategory_isActive_sortOrder_idx" ON "ContractCategory"("isActive", "sortOrder");

INSERT INTO "ContractCategory" ("name", "sortOrder")
SELECT category_name, row_number() OVER (ORDER BY category_name)::INTEGER
FROM (
    SELECT DISTINCT trim("category") AS category_name
    FROM "Contract"
    WHERE nullif(trim("category"), '') IS NOT NULL
) categories;

INSERT INTO "ContractCategory" ("name", "sortOrder")
SELECT '待补全', 9999
WHERE EXISTS (
    SELECT 1 FROM "Contract" WHERE nullif(trim("category"), '') IS NULL
);

ALTER TABLE "Contract"
    ADD COLUMN "contractUid" TEXT,
    ADD COLUMN "categoryId" INTEGER,
    ADD COLUMN "owningCompanyId" INTEGER,
    ADD COLUMN "ownerDepartmentId" INTEGER,
    ADD COLUMN "partyAId" INTEGER,
    ADD COLUMN "partyBId" INTEGER,
    ADD COLUMN "signedOn" DATE,
    ADD COLUMN "expiresOn" DATE,
    ADD COLUMN "signedOnPrecision" TEXT,
    ADD COLUMN "expiresOnPrecision" TEXT,
    ADD COLUMN "legacySignDateRaw" TEXT,
    ADD COLUMN "legacyEndDateRaw" TEXT,
    ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN "signatureStatus" TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN "performanceStatus" TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN "legacyStatusRaw" TEXT,
    ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    ADD COLUMN "confidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "archivedAt" TIMESTAMP(3),
    ADD COLUMN "archivedBy" INTEGER;

UPDATE "Contract"
SET
    "contractUid" = substr(uid_hash, 1, 8) || '-' || substr(uid_hash, 9, 4) || '-4' || substr(uid_hash, 14, 3) || '-8' || substr(uid_hash, 18, 3) || '-' || substr(uid_hash, 21, 12)
FROM (
    SELECT "id", md5('workspace-contract:' || "id"::TEXT) AS uid_hash
    FROM "Contract"
) identity
WHERE "Contract"."id" = identity."id";

UPDATE "Contract" contract
SET "categoryId" = category."id"
FROM "ContractCategory" category
WHERE category."name" = COALESCE(nullif(trim(contract."category"), ''), '待补全');

UPDATE "Contract"
SET
    "contractNo" = nullif(trim("contractNo"), ''),
    "partyA" = nullif(trim("partyA"), ''),
    "partyB" = nullif(trim("partyB"), ''),
    "legacySignDateRaw" = nullif(trim("signDate"), ''),
    "legacyEndDateRaw" = nullif(trim("endDate"), ''),
    "legacyStatusRaw" = nullif(trim("status"), ''),
    "lifecycleStatus" = CASE trim(COALESCE("status", ''))
        WHEN '执行中' THEN 'active'
        WHEN '已终止' THEN 'terminated'
        WHEN '已结束' THEN 'closed'
        WHEN '已失效' THEN 'expired'
        ELSE 'unknown'
    END,
    "signatureStatus" = CASE trim(COALESCE("status", ''))
        WHEN '未盖章' THEN 'unsigned'
        ELSE 'unknown'
    END,
    "performanceStatus" = CASE trim(COALESCE("status", ''))
        WHEN '执行中' THEN 'in_progress'
        ELSE 'unknown'
    END;

WITH legacy_dates AS (
    SELECT
        "id",
        nullif(trim("signDate"), '') AS sign_raw,
        nullif(trim("endDate"), '') AS end_raw,
        regexp_match(trim("signDate"), '^([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})$') AS sign_parts,
        regexp_match(trim("endDate"), '^([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})$') AS end_parts
    FROM "Contract"
), date_parts AS (
    SELECT
        *,
        CASE WHEN sign_parts IS NOT NULL THEN sign_parts[1]::INTEGER END AS sign_year,
        CASE WHEN sign_parts IS NOT NULL THEN sign_parts[2]::INTEGER END AS sign_month,
        CASE WHEN sign_parts IS NOT NULL THEN sign_parts[3]::INTEGER END AS sign_day,
        CASE WHEN end_parts IS NOT NULL THEN end_parts[1]::INTEGER END AS end_year,
        CASE WHEN end_parts IS NOT NULL THEN end_parts[2]::INTEGER END AS end_month,
        CASE WHEN end_parts IS NOT NULL THEN end_parts[3]::INTEGER END AS end_day
    FROM legacy_dates
), valid_months AS (
    SELECT
        *,
        CASE
            WHEN sign_year BETWEEN 1 AND 9999 AND sign_month BETWEEN 1 AND 12
            THEN make_date(sign_year, sign_month, 1)
        END AS sign_month_start,
        CASE
            WHEN end_year BETWEEN 1 AND 9999 AND end_month BETWEEN 1 AND 12
            THEN make_date(end_year, end_month, 1)
        END AS end_month_start
    FROM date_parts
)
UPDATE "Contract" contract
SET
    "signedOn" = CASE
        WHEN sign_month_start IS NOT NULL
            AND sign_day BETWEEN 1 AND EXTRACT(DAY FROM sign_month_start + INTERVAL '1 month - 1 day')
        THEN make_date(sign_year, sign_month, sign_day)
    END,
    "expiresOn" = CASE
        WHEN end_month_start IS NOT NULL
            AND end_day BETWEEN 1 AND EXTRACT(DAY FROM end_month_start + INTERVAL '1 month - 1 day')
        THEN make_date(end_year, end_month, end_day)
    END,
    "signedOnPrecision" = CASE
        WHEN sign_raw IS NULL THEN NULL
        WHEN sign_month_start IS NOT NULL
            AND sign_day BETWEEN 1 AND EXTRACT(DAY FROM sign_month_start + INTERVAL '1 month - 1 day')
        THEN 'day'
        WHEN sign_raw ~ '^[0-9]{4}$' AND sign_raw::INTEGER BETWEEN 1 AND 9999 THEN 'year'
        ELSE 'unknown'
    END,
    "expiresOnPrecision" = CASE
        WHEN end_raw IS NULL THEN NULL
        WHEN end_month_start IS NOT NULL
            AND end_day BETWEEN 1 AND EXTRACT(DAY FROM end_month_start + INTERVAL '1 month - 1 day')
        THEN 'day'
        WHEN end_raw ~ '^[0-9]{4}$' AND end_raw::INTEGER BETWEEN 1 AND 9999 THEN 'year'
        ELSE 'unknown'
    END
FROM valid_months
WHERE contract."id" = valid_months."id";

WITH party_names AS (
    SELECT "id", lower(trim("name")) AS normalized_name FROM "Party"
    UNION ALL
    SELECT "id", lower(trim("fullName")) AS normalized_name FROM "Party" WHERE nullif(trim("fullName"), '') IS NOT NULL
), unique_party_names AS (
    SELECT normalized_name, min("id") AS "id"
    FROM party_names
    GROUP BY normalized_name
    HAVING count(DISTINCT "id") = 1
)
UPDATE "Contract" contract
SET "partyAId" = party."id"
FROM unique_party_names party
WHERE lower(trim(contract."partyA")) = party.normalized_name;

WITH party_names AS (
    SELECT "id", lower(trim("name")) AS normalized_name FROM "Party"
    UNION ALL
    SELECT "id", lower(trim("fullName")) AS normalized_name FROM "Party" WHERE nullif(trim("fullName"), '') IS NOT NULL
), unique_party_names AS (
    SELECT normalized_name, min("id") AS "id"
    FROM party_names
    GROUP BY normalized_name
    HAVING count(DISTINCT "id") = 1
)
UPDATE "Contract" contract
SET "partyBId" = party."id"
FROM unique_party_names party
WHERE lower(trim(contract."partyB")) = party.normalized_name;

UPDATE "Contract" contract
SET "owningCompanyId" = company."id"
FROM "Company" company
WHERE company."partyId" = contract."partyAId";

DROP INDEX "Contract_endDate_idx";
DROP INDEX "Contract_status_idx";

ALTER TABLE "Contract"
    ALTER COLUMN "contractUid" SET NOT NULL,
    ALTER COLUMN "categoryId" SET NOT NULL,
    ALTER COLUMN "amount" TYPE DECIMAL(20,2) USING round("amount"::NUMERIC, 2),
    ALTER COLUMN "executedAmount" TYPE DECIMAL(20,2) USING round("executedAmount"::NUMERIC, 2),
    DROP COLUMN "category",
    DROP COLUMN "signDate",
    DROP COLUMN "endDate",
    DROP COLUMN "status";

CREATE UNIQUE INDEX "Contract_contractUid_key" ON "Contract"("contractUid");
CREATE INDEX "Contract_contractNo_idx" ON "Contract"("contractNo");
CREATE INDEX "Contract_categoryId_idx" ON "Contract"("categoryId");
CREATE INDEX "Contract_owningCompanyId_idx" ON "Contract"("owningCompanyId");
CREATE INDEX "Contract_ownerDepartmentId_idx" ON "Contract"("ownerDepartmentId");
CREATE INDEX "Contract_partyAId_idx" ON "Contract"("partyAId");
CREATE INDEX "Contract_partyBId_idx" ON "Contract"("partyBId");
CREATE INDEX "Contract_expiresOn_idx" ON "Contract"("expiresOn");
CREATE INDEX "Contract_lifecycleStatus_idx" ON "Contract"("lifecycleStatus");
CREATE INDEX "Contract_signatureStatus_idx" ON "Contract"("signatureStatus");
CREATE INDEX "Contract_performanceStatus_idx" ON "Contract"("performanceStatus");
CREATE INDEX "Contract_confidentialityLevel_idx" ON "Contract"("confidentialityLevel");
CREATE INDEX "Contract_isArchived_archivedAt_idx" ON "Contract"("isArchived", "archivedAt");

ALTER TABLE "Contract"
    ADD CONSTRAINT "Contract_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_owningCompanyId_fkey" FOREIGN KEY ("owningCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_ownerDepartmentId_fkey" FOREIGN KEY ("ownerDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_partyAId_fkey" FOREIGN KEY ("partyAId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_partyBId_fkey" FOREIGN KEY ("partyBId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_archivedBy_fkey" FOREIGN KEY ("archivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Contract_confidentialityLevel_check" CHECK ("confidentialityLevel" BETWEEN 2 AND 4),
    ADD CONSTRAINT "Contract_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "Contract_lifecycleStatus_check" CHECK ("lifecycleStatus" IN ('draft', 'active', 'terminated', 'expired', 'closed', 'unknown')),
    ADD CONSTRAINT "Contract_signatureStatus_check" CHECK ("signatureStatus" IN ('unknown', 'unsigned', 'signed')),
    ADD CONSTRAINT "Contract_performanceStatus_check" CHECK ("performanceStatus" IN ('unknown', 'not_started', 'in_progress', 'fulfilled', 'breached', 'waived')),
    ADD CONSTRAINT "Contract_archiveAudit_check" CHECK (
        ("isArchived" = false AND "archivedAt" IS NULL AND "archivedBy" IS NULL)
        OR ("isArchived" = true AND "archivedAt" IS NOT NULL)
    );
