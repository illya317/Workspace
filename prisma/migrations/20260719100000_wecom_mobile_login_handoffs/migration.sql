-- workspace:migration-mode=expand
-- Bridge a WeCom mobile OAuth result back to the originating browser without
-- sharing cookies between the WeCom WebView and the system browser.
CREATE TABLE "WecomLoginHandoff" (
    "id" TEXT NOT NULL,
    "browserSecretHash" TEXT NOT NULL,
    "oauthStateHash" TEXT NOT NULL,
    "returnTokenHash" TEXT,
    "verificationHash" TEXT,
    "nextPath" TEXT NOT NULL,
    "userId" INTEGER,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WecomLoginHandoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WecomLoginHandoff_oauthStateHash_key"
ON "WecomLoginHandoff"("oauthStateHash");

CREATE INDEX "WecomLoginHandoff_expiresAt_idx"
ON "WecomLoginHandoff"("expiresAt");

CREATE INDEX "WecomLoginHandoff_userId_createdAt_idx"
ON "WecomLoginHandoff"("userId", "createdAt");

ALTER TABLE "WecomLoginHandoff"
ADD CONSTRAINT "WecomLoginHandoff_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
