INSERT INTO "SystemConfig" ("key", "value")
VALUES ('finance.ledger.defaultCompanyCode', '02')
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
