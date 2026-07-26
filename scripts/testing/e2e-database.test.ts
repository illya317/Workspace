import assert from "node:assert/strict";
import test from "node:test";

import {
  requireDisposableE2eDatabase,
  requirePostgresqlCiDatabase,
} from "./e2e-database";

test("accepts a disposable PostgreSQL DATABASE_URL", () => {
  const target = requireDisposableE2eDatabase({
    DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/workspace_e2e",
  });
  assert.equal(target.databaseName, "workspace_e2e");
  assert.match(target.connectionString, /workspace_e2e$/);
});

test("rejects a development or production database", () => {
  assert.throws(
    () => requireDisposableE2eDatabase({
      DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/workspace",
    }),
    /only accepts disposable/,
  );
});

test("validates DIRECT_URL even when DATABASE_URL is disposable", () => {
  assert.throws(
    () => requireDisposableE2eDatabase({
      DATABASE_URL: "postgresql://pooler:secret@pooler.test/workspace_test",
      DIRECT_URL: "postgresql://direct:secret@database.test/workspace",
    }),
    /DIRECT_URL points to workspace/,
  );
});

test("requires DATABASE_URL and DIRECT_URL to select the same database", () => {
  assert.throws(
    () => requireDisposableE2eDatabase({
      DATABASE_URL: "postgresql://pooler:secret@pooler.test/workspace_test",
      DIRECT_URL: "postgresql://direct:secret@database.test/other_test",
    }),
    /must select the same E2E database/,
  );
});

test("PostgreSQL integration accepts only the stricter _ci suffix", () => {
  assert.equal(requirePostgresqlCiDatabase({
    DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/workspace_ci",
  }).databaseName, "workspace_ci");
  assert.throws(
    () => requirePostgresqlCiDatabase({
      DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/workspace_e2e",
    }),
    /only accepts a \*_ci database/,
  );
});
