-- CreateTable
CREATE TABLE "ExternalParty" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "identityNumber" TEXT,
    "legalRepresentative" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "address" TEXT,
    "remark" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalParty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalParty_category_code_key" ON "ExternalParty"("category", "code");

-- CreateIndex
CREATE INDEX "ExternalParty_category_name_idx" ON "ExternalParty"("category", "name");

-- CreateIndex
CREATE INDEX "ExternalParty_category_isActive_idx" ON "ExternalParty"("category", "isActive");
