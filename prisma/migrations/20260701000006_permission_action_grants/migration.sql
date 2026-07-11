CREATE TABLE "UserResourceActionGrant" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "resourceId" INTEGER NOT NULL,
  "actionKey" TEXT NOT NULL,
  "scopeId" TEXT,
  CONSTRAINT "UserResourceActionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PositionResourceActionGrant" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "positionId" INTEGER NOT NULL,
  "resourceId" INTEGER NOT NULL,
  "actionKey" TEXT NOT NULL,
  "scopeId" TEXT,
  CONSTRAINT "PositionResourceActionGrant_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PositionResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DepartmentResourceActionGrant" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "departmentId" INTEGER NOT NULL,
  "resourceId" INTEGER NOT NULL,
  "actionKey" TEXT NOT NULL,
  "scopeId" TEXT,
  CONSTRAINT "DepartmentResourceActionGrant_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DepartmentResourceActionGrant_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserResourceActionGrant_userId_resourceId_actionKey_scopeId_key" ON "UserResourceActionGrant"("userId", "resourceId", "actionKey", "scopeId");
CREATE UNIQUE INDEX "PositionResourceActionGrant_positionId_resourceId_actionKey_scopeId_key" ON "PositionResourceActionGrant"("positionId", "resourceId", "actionKey", "scopeId");
CREATE UNIQUE INDEX "DepartmentResourceActionGrant_departmentId_resourceId_actionKey_scopeId_key" ON "DepartmentResourceActionGrant"("departmentId", "resourceId", "actionKey", "scopeId");
