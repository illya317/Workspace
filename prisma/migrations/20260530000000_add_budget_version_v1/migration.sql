-- CreateTable
CREATE TABLE "FinanceBudgetVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "companyCode" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceFile" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FinanceBudgetVersion_year_companyCode_idx" ON "FinanceBudgetVersion"("year", "companyCode");

-- CreateIndex
CREATE INDEX "FinanceBudgetVersion_status_idx" ON "FinanceBudgetVersion"("status");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Redefine FinanceBudgetDept with versionId
CREATE TABLE "new_FinanceBudgetDept" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "versionId" INTEGER,
    "year" INTEGER NOT NULL,
    "companyCode" TEXT,
    "dept" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL,
    "accountId" INTEGER,
    "total" REAL NOT NULL DEFAULT 0,
    "month1" REAL NOT NULL DEFAULT 0,
    "month2" REAL NOT NULL DEFAULT 0,
    "month3" REAL NOT NULL DEFAULT 0,
    "month4" REAL NOT NULL DEFAULT 0,
    "month5" REAL NOT NULL DEFAULT 0,
    "month6" REAL NOT NULL DEFAULT 0,
    "month7" REAL NOT NULL DEFAULT 0,
    "month8" REAL NOT NULL DEFAULT 0,
    "month9" REAL NOT NULL DEFAULT 0,
    "month10" REAL NOT NULL DEFAULT 0,
    "month11" REAL NOT NULL DEFAULT 0,
    "month12" REAL NOT NULL DEFAULT 0,
    "sourceFile" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceBudgetDept_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceBudgetDept_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinanceBudgetDept" ("id", "year", "companyCode", "dept", "accountName", "expenseType", "accountId", "total", "month1", "month2", "month3", "month4", "month5", "month6", "month7", "month8", "month9", "month10", "month11", "month12", "sourceFile", "importedAt", "createdAt", "updatedAt")
SELECT "id", "year", "companyCode", "dept", "accountName", "expenseType", "accountId", "total", "month1", "month2", "month3", "month4", "month5", "month6", "month7", "month8", "month9", "month10", "month11", "month12", "sourceFile", "importedAt", "createdAt", "updatedAt" FROM "FinanceBudgetDept";
DROP TABLE "FinanceBudgetDept";
ALTER TABLE "new_FinanceBudgetDept" RENAME TO "FinanceBudgetDept";
CREATE UNIQUE INDEX "FinanceBudgetDept_versionId_dept_accountName_key" ON "FinanceBudgetDept"("versionId", "dept", "accountName");
CREATE INDEX "FinanceBudgetDept_year_companyCode_idx" ON "FinanceBudgetDept"("year", "companyCode");
CREATE INDEX "FinanceBudgetDept_accountId_idx" ON "FinanceBudgetDept"("accountId");
CREATE INDEX "FinanceBudgetDept_versionId_idx" ON "FinanceBudgetDept"("versionId");

-- Redefine FinanceBudgetRd with versionId
CREATE TABLE "new_FinanceBudgetRd" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "versionId" INTEGER,
    "year" INTEGER NOT NULL,
    "companyCode" TEXT,
    "project" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accountId" INTEGER,
    "total" REAL NOT NULL DEFAULT 0,
    "month1" REAL NOT NULL DEFAULT 0,
    "month2" REAL NOT NULL DEFAULT 0,
    "month3" REAL NOT NULL DEFAULT 0,
    "month4" REAL NOT NULL DEFAULT 0,
    "month5" REAL NOT NULL DEFAULT 0,
    "month6" REAL NOT NULL DEFAULT 0,
    "month7" REAL NOT NULL DEFAULT 0,
    "month8" REAL NOT NULL DEFAULT 0,
    "month9" REAL NOT NULL DEFAULT 0,
    "month10" REAL NOT NULL DEFAULT 0,
    "month11" REAL NOT NULL DEFAULT 0,
    "month12" REAL NOT NULL DEFAULT 0,
    "sourceFile" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceBudgetRd_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceBudgetRd_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinanceBudgetRd" ("id", "year", "companyCode", "project", "category", "accountId", "total", "month1", "month2", "month3", "month4", "month5", "month6", "month7", "month8", "month9", "month10", "month11", "month12", "sourceFile", "importedAt", "createdAt", "updatedAt")
SELECT "id", "year", "companyCode", "project", "category", "accountId", "total", "month1", "month2", "month3", "month4", "month5", "month6", "month7", "month8", "month9", "month10", "month11", "month12", "sourceFile", "importedAt", "createdAt", "updatedAt" FROM "FinanceBudgetRd";
DROP TABLE "FinanceBudgetRd";
ALTER TABLE "new_FinanceBudgetRd" RENAME TO "FinanceBudgetRd";
CREATE UNIQUE INDEX "FinanceBudgetRd_versionId_project_category_key" ON "FinanceBudgetRd"("versionId", "project", "category");
CREATE INDEX "FinanceBudgetRd_year_companyCode_idx" ON "FinanceBudgetRd"("year", "companyCode");
CREATE INDEX "FinanceBudgetRd_accountId_idx" ON "FinanceBudgetRd"("accountId");
CREATE INDEX "FinanceBudgetRd_versionId_idx" ON "FinanceBudgetRd"("versionId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 为现有预算数据创建默认 active version（从 Dept 数据）
INSERT INTO "FinanceBudgetVersion" ("year", "companyCode", "name", "status", "type", "sourceFile", "createdAt", "updatedAt")
SELECT DISTINCT "year", "companyCode", '初始版本', 'active', 'all', "sourceFile", datetime('now'), datetime('now')
FROM "FinanceBudgetDept";

-- 更新 FinanceBudgetDept 的 versionId
UPDATE "FinanceBudgetDept"
SET "versionId" = (
  SELECT v.id FROM "FinanceBudgetVersion" v
  WHERE v.year = "FinanceBudgetDept".year
    AND (v."companyCode" = "FinanceBudgetDept"."companyCode" OR (v."companyCode" IS NULL AND "FinanceBudgetDept"."companyCode" IS NULL))
    AND v.status = 'active'
  LIMIT 1
);

-- 为 Rd 独有的 (year, companyCode) 组合创建版本
INSERT INTO "FinanceBudgetVersion" ("year", "companyCode", "name", "status", "type", "sourceFile", "createdAt", "updatedAt")
SELECT DISTINCT "year", "companyCode", '初始版本', 'active', 'all', "sourceFile", datetime('now'), datetime('now')
FROM "FinanceBudgetRd"
WHERE "year" || '-' || COALESCE("companyCode", '_NULL_') NOT IN (
  SELECT "year" || '-' || COALESCE("companyCode", '_NULL_') FROM "FinanceBudgetVersion"
);

-- 更新 FinanceBudgetRd 的 versionId
UPDATE "FinanceBudgetRd"
SET "versionId" = (
  SELECT v.id FROM "FinanceBudgetVersion" v
  WHERE v.year = "FinanceBudgetRd".year
    AND (v."companyCode" = "FinanceBudgetRd"."companyCode" OR (v."companyCode" IS NULL AND "FinanceBudgetRd"."companyCode" IS NULL))
    AND v.status = 'active'
  LIMIT 1
);

-- 同 (year, companyCode) 下只有一个 active 版本的约束
CREATE UNIQUE INDEX idx_active_budget_version ON "FinanceBudgetVersion"("year", COALESCE("companyCode", '')) WHERE "status" = 'active';
