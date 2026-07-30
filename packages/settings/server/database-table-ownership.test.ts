import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { databaseTableOwnerKey } from "./database-table-ownership";

test("every current Prisma model maps to a module code", () => {
  const modelDirectory = path.resolve("prisma/models");
  const models = readdirSync(modelDirectory)
    .filter((file) => file.endsWith(".prisma"))
    .flatMap((file) => [...readFileSync(path.join(modelDirectory, file), "utf8").matchAll(/^model\s+(\w+)\s+\{/gm)]
      .map((match) => match[1]!));
  const unassigned = models.filter((model) => !databaseTableOwnerKey(model));

  assert.deepEqual(unassigned, []);
});

test("unknown database tables stay explicitly unassigned", () => {
  assert.equal(databaseTableOwnerKey("UnexpectedLegacyTable"), null);
});

test("relation policy persistence belongs to Settings governance", () => {
  assert.equal(databaseTableOwnerKey("RelationPolicyConfig"), "settings.governance");
  assert.equal(databaseTableOwnerKey("RelationPolicyRevision"), "settings.governance");
});
