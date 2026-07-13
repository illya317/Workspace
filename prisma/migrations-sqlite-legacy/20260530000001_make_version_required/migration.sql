-- Make versionId required on FinanceBudgetDept
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FinanceBudgetDept" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "versionId" INTEGER NOT NULL,
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
    CONSTRAINT "FinanceBudgetDept_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinanceBudgetDept_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinanceBudgetDept" SELECT * FROM "FinanceBudgetDept";
DROP TABLE "FinanceBudgetDept";
ALTER TABLE "new_FinanceBudgetDept" RENAME TO "FinanceBudgetDept";
CREATE UNIQUE INDEX "FinanceBudgetDept_versionId_dept_accountName_key" ON "FinanceBudgetDept"("versionId", "dept", "accountName");
CREATE INDEX "FinanceBudgetDept_year_companyCode_idx" ON "FinanceBudgetDept"("year", "companyCode");
CREATE INDEX "FinanceBudgetDept_accountId_idx" ON "FinanceBudgetDept"("accountId");
CREATE INDEX "FinanceBudgetDept_versionId_idx" ON "FinanceBudgetDept"("versionId");

-- Make versionId required on FinanceBudgetRd
CREATE TABLE "new_FinanceBudgetRd" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "versionId" INTEGER NOT NULL,
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
    CONSTRAINT "FinanceBudgetRd_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FinanceBudgetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinanceBudgetRd_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinanceBudgetRd" SELECT * FROM "FinanceBudgetRd";
DROP TABLE "FinanceBudgetRd";
ALTER TABLE "new_FinanceBudgetRd" RENAME TO "FinanceBudgetRd";
CREATE UNIQUE INDEX "FinanceBudgetRd_versionId_project_category_key" ON "FinanceBudgetRd"("versionId", "project", "category");
CREATE INDEX "FinanceBudgetRd_year_companyCode_idx" ON "FinanceBudgetRd"("year", "companyCode");
CREATE INDEX "FinanceBudgetRd_accountId_idx" ON "FinanceBudgetRd"("accountId");
CREATE INDEX "FinanceBudgetRd_versionId_idx" ON "FinanceBudgetRd"("versionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
