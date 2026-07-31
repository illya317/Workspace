-- workspace:migration-mode=expand
CREATE TABLE "RelationPolicyConfig" (
    "policyKey" TEXT NOT NULL,
    "settingsJson" JSONB NOT NULL,
    "baselineHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationPolicyConfig_pkey" PRIMARY KEY ("policyKey")
);

CREATE TABLE "RelationPolicyRevision" (
    "id" SERIAL NOT NULL,
    "policyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeKind" TEXT NOT NULL,
    "reason" TEXT,
    "settingsJson" JSONB NOT NULL,
    "baselineHash" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationPolicyRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RelationPolicyConfig_updatedByUserId_idx"
    ON "RelationPolicyConfig"("updatedByUserId");

CREATE UNIQUE INDEX "RelationPolicyRevision_policyKey_version_key"
    ON "RelationPolicyRevision"("policyKey", "version");

CREATE INDEX "RelationPolicyRevision_actorUserId_createdAt_idx"
    ON "RelationPolicyRevision"("actorUserId", "createdAt");

ALTER TABLE "RelationPolicyConfig"
    ADD CONSTRAINT "RelationPolicyConfig_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RelationPolicyRevision"
    ADD CONSTRAINT "RelationPolicyRevision_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
