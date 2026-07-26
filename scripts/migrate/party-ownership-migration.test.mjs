import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL(
  "../../prisma/migrations/00000000000000_sanitized_baseline/migration.sql",
  import.meta.url,
);
const migrationPath = fileURLToPath(migrationUrl);

test("sanitized baseline declares Party, Company, and OwnershipInterest structurally", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /^-- workspace:migration-mode=maintenance\n-- Sanitized structural baseline\. Contains schema only; tenant facts belong outside Git\.\n/);
  assert.match(sql, /CREATE TABLE "Party" \([\s\S]*?"identityNumber" TEXT NOT NULL/);
  assert.match(sql, /CREATE TABLE "Company" \([\s\S]*?"partyId" INTEGER NOT NULL/);
  assert.match(sql, /CREATE TABLE "OwnershipInterest" \([\s\S]*?"ownerPartyId" INTEGER NOT NULL,[\s\S]*?"issuerCompanyId" INTEGER NOT NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX "Company_partyId_key" ON "Company"\("partyId"\)/);
  assert.doesNotMatch(sql, /^(?:\s*)(?:INSERT|UPDATE|DELETE|MERGE|COPY)\b/im);
});

test("sanitized baseline installs ownership foreign keys after the schema tables", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const partyTableAt = sql.indexOf('CREATE TABLE "Party"');
  const companyTableAt = sql.indexOf('CREATE TABLE "Company"');
  const ownershipTableAt = sql.indexOf('CREATE TABLE "OwnershipInterest"');
  const companyPartyForeignKeyAt = sql.indexOf('ADD CONSTRAINT "Company_partyId_fkey"');
  const ownershipOwnerForeignKeyAt = sql.indexOf('ADD CONSTRAINT "OwnershipInterest_ownerPartyId_fkey"');
  const ownershipIssuerForeignKeyAt = sql.indexOf('ADD CONSTRAINT "OwnershipInterest_issuerCompanyId_fkey"');

  assert.ok(partyTableAt >= 0 && companyTableAt >= 0 && ownershipTableAt >= 0, "all identity tables must be declared");
  assert.ok(companyPartyForeignKeyAt > companyTableAt, "Company Party relation must follow the Company table");
  assert.ok(ownershipOwnerForeignKeyAt > ownershipTableAt, "ownership owner relation must follow the ownership table");
  assert.ok(ownershipIssuerForeignKeyAt > ownershipTableAt, "ownership issuer relation must follow the ownership table");
});
