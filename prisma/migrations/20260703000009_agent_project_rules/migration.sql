CREATE TABLE "AgentProjectRule" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "scope" TEXT NOT NULL,
  "resourceKey" TEXT,
  "agentRoleKey" TEXT,
  "title" TEXT NOT NULL,
  "itemsJson" TEXT NOT NULL DEFAULT '[]',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentProjectRule_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AgentProjectRule_scope_resourceKey_sortOrder_idx" ON "AgentProjectRule"("scope", "resourceKey", "sortOrder");
CREATE INDEX "AgentProjectRule_status_idx" ON "AgentProjectRule"("status");
