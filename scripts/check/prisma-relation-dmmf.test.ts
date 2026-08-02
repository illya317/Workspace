import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadPrismaDmmf, prismaDmmfEnvironment } from "./prisma-relation-dmmf";

test("static DMMF generation never consumes private database credentials", () => {
  const sourceEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://private:secret@db/private",
    DIRECT_URL: "postgresql://private:secret@db/private",
    SHADOW_DATABASE_URL: "postgresql://private:secret@db/private-shadow",
    SAFE_MARKER: "preserved",
  };
  const environment: NodeJS.ProcessEnv = prismaDmmfEnvironment(sourceEnvironment);
  assert.equal(environment.NODE_ENV, "test");
  assert.equal(environment.SAFE_MARKER, "preserved");
  for (const key of ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"]) {
    assert.match(environment[key] ?? "", /^postgresql:\/\/relation_policy_static:unused@127\.0\.0\.1:1\//);
    assert.doesNotMatch(environment[key] ?? "", /private|secret/);
  }
});

test("static DMMF generation succeeds in a clean worktree without .env", () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const dmmf = loadPrismaDmmf(repositoryRoot);
  assert.ok(dmmf.models.length > 0);
});
