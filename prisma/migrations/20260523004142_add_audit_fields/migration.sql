-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT '在职',
    "currentCompany" TEXT,
    "joinDate" TEXT,
    "leaveDate" TEXT,
    "leaveReason" TEXT,
    "officeLocation" TEXT,
    "attendanceType" TEXT,
    "contracts" TEXT,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Employment_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employment" ("attendanceType", "contracts", "createdAt", "currentCompany", "employeeId", "id", "joinDate", "leaveDate", "leaveReason", "officeLocation", "status", "updatedAt") SELECT "attendanceType", "contracts", "createdAt", "currentCompany", "employeeId", "id", "joinDate", "leaveDate", "leaveReason", "officeLocation", "status", "updatedAt" FROM "Employment";
DROP TABLE "Employment";
ALTER TABLE "new_Employment" RENAME TO "Employment";
CREATE TABLE "new_PositionDescription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentName" TEXT,
    "reportTo" TEXT,
    "positionPurpose" TEXT,
    "summary" TEXT,
    "headcount" INTEGER,
    "version" TEXT,
    "effectiveDate" TEXT,
    "sourceFile" TEXT NOT NULL,
    "managementGroupId" INTEGER NOT NULL,
    "details" TEXT,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PositionDescription_managementGroupId_fkey" FOREIGN KEY ("managementGroupId") REFERENCES "ManagementGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PositionDescription_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PositionDescription" ("code", "createdAt", "departmentName", "details", "effectiveDate", "headcount", "id", "managementGroupId", "name", "positionPurpose", "reportTo", "sourceFile", "summary", "updatedAt", "version") SELECT "code", "createdAt", "departmentName", "details", "effectiveDate", "headcount", "id", "managementGroupId", "name", "positionPurpose", "reportTo", "sourceFile", "summary", "updatedAt", "version" FROM "PositionDescription";
DROP TABLE "PositionDescription";
ALTER TABLE "new_PositionDescription" RENAME TO "PositionDescription";
CREATE UNIQUE INDEX "PositionDescription_code_key" ON "PositionDescription"("code");
CREATE TABLE "new_Report" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "targetType" TEXT NOT NULL DEFAULT 'department',
    "targetId" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Report_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("createdAt", "date", "id", "notes", "targetId", "targetType", "taskName", "updatedAt", "userId", "version") SELECT "createdAt", "date", "id", "notes", "targetId", "targetType", "taskName", "updatedAt", "userId", "version" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE UNIQUE INDEX "Report_userId_targetType_targetId_date_key" ON "Report"("userId", "targetType", "targetId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
