ALTER TABLE "Department" ADD COLUMN "hierarchyKind" TEXT NOT NULL DEFAULT 'M';

UPDATE "Department"
SET "hierarchyKind" = 'M'
WHERE "hierarchyKind" IS NULL OR "hierarchyKind" = '';

INSERT INTO "Department" ("code", "name", "hierarchyKind", "level", "parentId")
SELECT 'BOD', '董事会', 'G', 1, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "Department" WHERE "code" = 'BOD'
);

INSERT INTO "Department" ("code", "name", "hierarchyKind", "level", "parentId")
SELECT 'NOM', '提名委员会', 'G', 2, (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "Department" WHERE "code" = 'NOM'
);

INSERT INTO "Department" ("code", "name", "hierarchyKind", "level", "parentId")
SELECT 'STR', '战略委员会', 'G', 2, (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "Department" WHERE "code" = 'STR'
);

INSERT INTO "Department" ("code", "name", "hierarchyKind", "level", "parentId")
SELECT 'EXC', '执行委员会', 'G', 2, (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "Department" WHERE "code" = 'EXC'
);

INSERT INTO "Department" ("code", "name", "hierarchyKind", "level", "parentId")
SELECT 'AUD', '审计委员会', 'G', 2, (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "Department" WHERE "code" = 'AUD'
);

UPDATE "Department"
SET "name" = '董事会', "hierarchyKind" = 'G', "level" = 1, "parentId" = NULL
WHERE "code" = 'BOD';

UPDATE "Department"
SET "name" = '提名委员会', "hierarchyKind" = 'G', "level" = 2, "parentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE "code" = 'NOM';

UPDATE "Department"
SET "name" = '战略委员会', "hierarchyKind" = 'G', "level" = 2, "parentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE "code" = 'STR';

UPDATE "Department"
SET "name" = '执行委员会', "hierarchyKind" = 'G', "level" = 2, "parentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE "code" = 'EXC';

UPDATE "Department"
SET "name" = '审计委员会', "hierarchyKind" = 'G', "level" = 2, "parentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BOD' LIMIT 1)
WHERE "code" = 'AUD';

UPDATE "Department"
SET
  "code" = 'OPS',
  "name" = '运营委员会',
  "hierarchyKind" = 'G',
  "level" = 3,
  "parentId" = (SELECT "id" FROM "Department" WHERE "code" = 'EXC' LIMIT 1)
WHERE "id" = (
  SELECT "id"
  FROM "Department"
  WHERE "code" IN ('OPS', 'EXC001') OR "name" = '运营委员会'
  ORDER BY
    CASE
      WHEN "code" = 'OPS' THEN 0
      WHEN "code" = 'EXC001' THEN 1
      ELSE 2
    END,
    "id"
  LIMIT 1
);

INSERT INTO "Department" ("code", "name", "hierarchyKind", "level", "parentId")
SELECT 'OPS', '运营委员会', 'G', 3, (SELECT "id" FROM "Department" WHERE "code" = 'EXC' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "Department" WHERE "code" = 'OPS' OR "name" = '运营委员会'
);

UPDATE "Position"
SET "code" = REPLACE("code", 'GW-EXC001-', 'GW-OPS-')
WHERE "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'OPS' LIMIT 1)
  AND "code" LIKE 'GW-EXC001-%';

UPDATE "Department"
SET
  "code" = 'BSC',
  "name" = '董秘办及资本证券部',
  "hierarchyKind" = 'G',
  "level" = 3,
  "parentId" = (SELECT "id" FROM "Department" WHERE "code" = 'EXC' LIMIT 1)
WHERE "id" = (
  SELECT "id"
  FROM "Department"
  WHERE "code" IN ('BSC', 'EXC100') OR "name" IN ('董秘办及资本证券部', '董秘办及资本证券')
  ORDER BY
    CASE
      WHEN "code" = 'BSC' THEN 0
      WHEN "code" = 'EXC100' THEN 1
      ELSE 2
    END,
    "id"
  LIMIT 1
);

INSERT INTO "Department" ("code", "name", "hierarchyKind", "level", "parentId")
SELECT 'BSC', '董秘办及资本证券部', 'G', 3, (SELECT "id" FROM "Department" WHERE "code" = 'EXC' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "Department" WHERE "code" IN ('BSC', 'EXC100') OR "name" IN ('董秘办及资本证券部', '董秘办及资本证券')
);

UPDATE "Position"
SET "code" = REPLACE("code", 'GW-EXC100-', 'GW-BSC-')
WHERE "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BSC' LIMIT 1)
  AND "code" LIKE 'GW-EXC100-%';

UPDATE "Position"
SET "code" = 'GW-BSC-' || substr("code", -2)
WHERE "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BSC' LIMIT 1)
  AND "code" LIKE 'GW-%'
  AND "code" NOT LIKE 'GW-BSC-%';

CREATE INDEX "Department_hierarchyKind_level_idx" ON "Department"("hierarchyKind", "level");
