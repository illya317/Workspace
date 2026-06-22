CREATE TABLE "OpenApiClient" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "keyHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "ownerUserId" INTEGER,
  "expiresAt" DATETIME,
  "lastUsedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "OpenApiResource" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "registrationKey" TEXT NOT NULL,
  "runtimeParentResourceKey" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "OpenApiScope" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceId" INTEGER NOT NULL,
  "registrationKey" TEXT NOT NULL,
  "runtimeParentResourceKey" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OpenApiScope_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "OpenApiResource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OpenApiClientScopeGrant" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "clientId" INTEGER NOT NULL,
  "scopeId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpenApiClientScopeGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OpenApiClient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OpenApiClientScopeGrant_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "OpenApiScope" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OpenApiAccessLog" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "clientId" INTEGER,
  "clientName" TEXT,
  "endpointKey" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "status" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "errorCode" TEXT,
  "ip" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpenApiAccessLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OpenApiClient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OpenApiClient_keyHash_key" ON "OpenApiClient"("keyHash");
CREATE UNIQUE INDEX "OpenApiResource_key_key" ON "OpenApiResource"("key");
CREATE UNIQUE INDEX "OpenApiScope_key_key" ON "OpenApiScope"("key");
CREATE INDEX "OpenApiScope_resourceId_idx" ON "OpenApiScope"("resourceId");
CREATE UNIQUE INDEX "OpenApiClientScopeGrant_clientId_scopeId_action_key" ON "OpenApiClientScopeGrant"("clientId", "scopeId", "action");
CREATE INDEX "OpenApiClientScopeGrant_scopeId_idx" ON "OpenApiClientScopeGrant"("scopeId");
CREATE INDEX "OpenApiAccessLog_clientId_idx" ON "OpenApiAccessLog"("clientId");
CREATE INDEX "OpenApiAccessLog_scopeKey_idx" ON "OpenApiAccessLog"("scopeKey");
CREATE INDEX "OpenApiAccessLog_createdAt_idx" ON "OpenApiAccessLog"("createdAt");
