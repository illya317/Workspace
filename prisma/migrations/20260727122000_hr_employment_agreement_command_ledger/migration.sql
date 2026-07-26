-- workspace:migration-mode=expand

CREATE TABLE "EmploymentAgreementChange" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "employeeId" INTEGER NOT NULL,
  "agreementId" INTEGER,
  "commandKind" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "expectedVersion" INTEGER,
  "effectManifestJson" TEXT NOT NULL,
  "actorUserId" INTEGER NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmploymentAgreementChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmploymentAgreementChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmploymentAgreementChange_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "EmploymentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmploymentAgreementChange_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmploymentAgreementChange_idempotencyKey_key" ON "EmploymentAgreementChange"("idempotencyKey");
CREATE INDEX "EmploymentAgreementChange_employeeId_recordedAt_idx" ON "EmploymentAgreementChange"("employeeId", "recordedAt");
CREATE INDEX "EmploymentAgreementChange_agreementId_recordedAt_idx" ON "EmploymentAgreementChange"("agreementId", "recordedAt");
CREATE INDEX "EmploymentAgreementChange_actorUserId_recordedAt_idx" ON "EmploymentAgreementChange"("actorUserId", "recordedAt");
