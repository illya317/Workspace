PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "wxUserId" TEXT,
  "username" TEXT NOT NULL CHECK(length(trim("username")) > 0),
  "password" TEXT,
  "avatar" TEXT,
  "routineItems" TEXT,
  "preferredDepartmentIds" TEXT,
  "canLogin" BOOLEAN NOT NULL DEFAULT true,
  "apiKey" TEXT,
  "employeeId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "new_User" (
  "id",
  "wxUserId",
  "username",
  "password",
  "avatar",
  "routineItems",
  "preferredDepartmentIds",
  "canLogin",
  "apiKey",
  "employeeId",
  "createdAt",
  "sessionVersion"
)
SELECT
  "id",
  "wxUserId",
  "username",
  "password",
  "avatar",
  "routineItems",
  "preferredDepartmentIds",
  "canLogin",
  "apiKey",
  "employeeId",
  "createdAt",
  "sessionVersion"
FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE UNIQUE INDEX "User_wxUserId_key" ON "User"("wxUserId");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

PRAGMA foreign_keys=ON;
