import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkMigrationPolicy,
  findExpandViolations,
  inspectMigrationSql,
  parseMigrationMode,
} from "./check-migration-policy.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("./check-migration-policy.mjs", import.meta.url));

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return allowFailure ? result : result.stdout.trim();
}

function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function repositoryFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-migration-policy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Migration Policy Test"]);
  git(root, ["config", "user.email", "migration-policy@example.test"]);
  write(root, "README.md", "fixture\n");
  write(root, "prisma/migrations/20200101000000_historical/migration.sql", "CREATE TABLE historical (id INT);\n");
  const baseSha = commit(root, "base");
  return { root, baseSha };
}

test("requires exactly one leading explicit migration-mode marker", () => {
  assert.equal(parseMigrationMode("\n-- workspace:migration-mode=expand\nSELECT 1;\n"), "expand");
  assert.equal(parseMigrationMode("\uFEFF-- workspace:migration-mode=maintenance\r\nSELECT 1;\r\n"), "maintenance");
  assert.throws(() => parseMigrationMode("SELECT 1;\n"), /first non-empty line must be/);
  assert.throws(
    () => parseMigrationMode("-- an explanation\n-- workspace:migration-mode=expand\nSELECT 1;\n"),
    /first non-empty line must be/,
  );
  assert.throws(
    () => parseMigrationMode("-- workspace:migration-mode=expand\n-- workspace:migration-mode=maintenance\n"),
    /exactly one/,
  );
  assert.throws(() => parseMigrationMode("-- workspace:migration-mode=EXPAND\n"), /first non-empty line must be/);
});

test("expand mode allows additive SQL and a new NOT NULL column with a non-NULL default", () => {
  const sql = `-- workspace:migration-mode=expand
CREATE TABLE new_table (
  id TEXT NOT NULL PRIMARY KEY
);
ALTER TABLE existing_table
  ADD COLUMN code TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN amount NUMERIC(10, 2) DEFAULT 0 NOT NULL,
  ADD COLUMN optional_note TEXT;
`;
  assert.deepEqual(inspectMigrationSql({ filePath: "migration.sql", sql }), {
    path: "migration.sql",
    mode: "expand",
    violations: [],
  });
});

test("expand scanner rejects destructive and incompatible SQL", () => {
  const cases = [
    ["DELETE FROM customer WHERE retired = true;", "delete-data"],
    [
      "UPDATE customer SET value = (SELECT value FROM defaults WHERE key = 'x');",
      "unsupported-expand-statement",
    ],
    ["UPDATE customer SET 名WHERE名 = 1;", "unsupported-expand-statement"],
    ["CREATE INDEX customer_value_idx ON customer(value);", "unsupported-expand-statement"],
    [
      "BEGIN; CREATE INDEX CONCURRENTLY customer_value_idx ON customer(value); COMMIT;",
      "unsupported-expand-statement",
    ],
    ["TRUNCATE TABLE customer;", "truncate-table"],
    ["DROP TABLE customer;", "drop-table"],
    ["DROP INDEX customer_email_idx;", "drop-index"],
    ["ALTER TABLE customer DROP CONSTRAINT customer_email_key;", "drop-constraint"],
    ["ALTER TABLE customer DROP COLUMN legacy_code;", "drop-column"],
    ["ALTER TABLE customer DROP legacy_code;", "drop-column"],
    ["DROP TYPE old_status;", "drop-type"],
    ["ALTER TYPE address DROP ATTRIBUTE postcode;", "alter-type-destructive"],
    ["ALTER TYPE mood RENAME VALUE 'sad' TO 'unhappy';", "alter-type-destructive"],
    ["ALTER TABLE customer RENAME old_name TO name;", "rename"],
    ["ALTER TABLE customer ALTER COLUMN code TYPE BIGINT USING code::BIGINT;", "alter-column-type"],
    ["ALTER TABLE customer ALTER COLUMN name SET NOT NULL;", "set-not-null"],
    ["ALTER TABLE customer ADD COLUMN code TEXT NOT NULL;", "add-not-null-without-default"],
    ["ALTER TABLE customer ADD COLUMN code TEXT DEFAULT NULL NOT NULL;", "add-not-null-without-default"],
    ["ALTER TABLE customer ADD COLUMN code TEXT DEFAULT (NULL) NOT NULL;", "add-not-null-without-default"],
  ];
  for (const [statement, expectedCode] of cases) {
    const codes = findExpandViolations(`-- workspace:migration-mode=expand\n${statement}\n`)
      .map((item) => item.code);
    assert.ok(codes.includes(expectedCode), `${statement} should report ${expectedCode}; got ${codes.join(", ")}`);
  }
});

test("expand scanner only permits DROP NOT NULL as a safe DROP operation", () => {
  const safeSql = `-- workspace:migration-mode=expand
ALTER TABLE customer ALTER COLUMN code DROP NOT NULL;
`;
  assert.deepEqual(findExpandViolations(safeSql), []);

  const unsafeSql = `-- workspace:migration-mode=expand
ALTER TABLE customer ALTER COLUMN code DROP DEFAULT;
`;
  assert.ok(findExpandViolations(unsafeSql).some((item) => item.code === "drop-operation"));
});

test("expand scanner fails closed for every other DROP object family", () => {
  const statements = [
    "DROP VIEW customer_view;",
    "DROP SCHEMA legacy CASCADE;",
    "DROP SEQUENCE customer_id_seq;",
    "DROP FUNCTION legacy_customer();",
    "DROP TRIGGER customer_guard ON customer;",
    "DROP RULE customer_rule ON customer;",
    "DROP POLICY customer_policy ON customer;",
    "ALTER TABLE customer ALTER COLUMN code DROP IDENTITY;",
    "ALTER TABLE customer ALTER COLUMN code DROP EXPRESSION;",
  ];
  for (const statement of statements) {
    const violations = findExpandViolations(`-- workspace:migration-mode=expand\n${statement}\n`);
    assert.ok(
      violations.some((item) => item.code === "drop-operation"),
      `${statement} must require maintenance`,
    );
  }
});

test("expand statement allowlist rejects writer-breaking and unknown operations", () => {
  const statements = [
    "REVOKE INSERT, UPDATE ON customer FROM workspace_app;",
    "ALTER TABLE customer SET SCHEMA private;",
    "ALTER TABLE customer DISABLE TRIGGER ALL;",
    "ALTER TABLE customer DISABLE RULE customer_rule;",
    "ALTER TABLE customer ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;",
    "ALTER TABLE customer ALTER COLUMN id SET GENERATED ALWAYS;",
    "CREATE OR REPLACE FUNCTION customer_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;",
    "DO $$ BEGIN DELETE FROM customer; DROP TABLE customer; END $$;",
    "CREATE SCHEMA audit CREATE TABLE audit.customer(id INTEGER);",
  ];
  for (const statement of statements) {
    const violations = findExpandViolations(
      "-- workspace:migration-mode=expand\n" + statement + "\n",
    );
    assert.ok(
      violations.some((item) => item.code === "unsupported-expand-statement"),
      statement + " must be outside the expand allowlist",
    );
  }
});

test("expand allowlist handles quoted names and limits constraints on existing tables", () => {
  const safe = [
    "-- workspace:migration-mode=expand",
    "CREATE TABLE \"audit\".\"Child\" (id INTEGER NOT NULL PRIMARY KEY, parent_id INTEGER);",
    "CREATE UNIQUE INDEX \"Child_id_key\" ON \"audit\".\"Child\"(id);",
    "ALTER TABLE \"audit\".\"Child\" ADD CONSTRAINT \"Child_parent_fkey\"",
    "  FOREIGN KEY (parent_id) REFERENCES parent(id);",
    "ALTER TABLE \"Existing\" ADD COLUMN \"parentId\" INTEGER;",
    "ALTER TABLE \"Existing\" ADD CONSTRAINT \"Existing_parent_fkey\"",
    "  FOREIGN KEY (\"parentId\") REFERENCES parent(id);",
    "",
  ].join("\n");
  assert.deepEqual(findExpandViolations(safe), []);

  const unsafe = [
    "-- workspace:migration-mode=expand",
    "ALTER TABLE \"Existing\" ADD CONSTRAINT \"Existing_status_check\"",
    "  CHECK (status IN ('open', 'closed'));",
    "",
  ].join("\n");
  assert.ok(
    findExpandViolations(unsafe).some((item) => item.code === "unsupported-expand-statement"),
  );

  const existingViaIfNotExists = [
    "-- workspace:migration-mode=expand",
    "CREATE TABLE IF NOT EXISTS customer(id INTEGER);",
    "ALTER TABLE customer ADD CONSTRAINT customer_id_key UNIQUE(id);",
    "",
  ].join("\n");
  assert.ok(
    findExpandViolations(existingViaIfNotExists)
      .some((item) => item.code === "unsupported-expand-statement"),
  );
});

test("scanner ignores comments, ordinary literals, and quoted identifiers", () => {
  const sql = `-- workspace:migration-mode=expand
-- DROP TABLE customer;
/* ALTER TABLE customer DROP COLUMN name; */
CREATE TABLE "RENAME" ("DROP COLUMN" TEXT DEFAULT 'DROP TYPE old_status; ALTER TABLE x RENAME y TO z;');
`;
  assert.deepEqual(findExpandViolations(sql), []);
});

test("ordinary PostgreSQL strings cannot hide destructive SQL with a trailing backslash", () => {
  for (const statement of [
    "SELECT 'trailing\\'; DROP TABLE customer;",
    "INSERT INTO log(value) VALUES (éE'trailing\\'; DROP TABLE customer;",
    "INSERT INTO log(value) VALUES (ARRAY[$tag$'$tag$]); DROP TABLE customer;",
    "INSERT INTO log(value) VALUES ($名$'$名$); DROP TABLE customer;",
  ]) {
    const sql = "-- workspace:migration-mode=expand\n" + statement + "\n";
    assert.ok(findExpandViolations(sql).some((item) => item.code === "drop-table"));
  }
});

test("identifier dollar signs cannot open a fake dollar-quoted body", () => {
  for (const identifier of ["foo", "é", "名"]) {
    const sql = "-- workspace:migration-mode=expand\n"
      + "INSERT INTO " + identifier + "$tag$ VALUES (1); DROP TABLE customer;\n";
    assert.ok(findExpandViolations(sql).some((item) => item.code === "drop-table"));
  }
});

test("maintenance mode explicitly permits incompatible SQL", () => {
  const result = inspectMigrationSql({
    filePath: "prisma/migrations/maintenance/migration.sql",
    sql: "-- workspace:migration-mode=maintenance\nDROP TABLE customer;\n",
  });
  assert.equal(result.mode, "maintenance");
  assert.deepEqual(result.violations, []);
});

test("single-file CLI uses the same normalized marker parser as repository policy", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-migration-file-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const migration = path.join(root, "migration.sql");
  fs.writeFileSync(migration, "\uFEFF  -- workspace:migration-mode=maintenance\r\nDROP TABLE customer;\r\n");
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--file", migration, "--print-mode"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "maintenance\n");

  fs.writeFileSync(migration, "-- workspace:migration-mode=expand\nDROP DEFAULT;\n");
  const unsafe = spawnSync(process.execPath, [SCRIPT_PATH, "--file", migration, "--print-mode"], {
    encoding: "utf8",
  });
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /drop-operation/);
});

test("repository check reads only changed migration files from the committed head", (t) => {
  const { root, baseSha } = repositoryFixture(t);
  write(
    root,
    "prisma/migrations/20260716000000_add_code/migration.sql",
    "-- workspace:migration-mode=expand\nALTER TABLE historical ADD COLUMN code TEXT;\n",
  );
  write(
    root,
    "prisma/migrations/20260716000001_contract/migration.sql",
    "-- workspace:migration-mode=maintenance\nALTER TABLE historical DROP COLUMN code;\n",
  );
  const headSha = commit(root, "add migrations");
  const result = checkMigrationPolicy({ cwd: root, baseSha, headSha });

  assert.deepEqual(result.changedMigrations, [
    {
      path: "prisma/migrations/20260716000000_add_code/migration.sql",
      status: "A",
      mode: "expand",
    },
    {
      path: "prisma/migrations/20260716000001_contract/migration.sql",
      status: "A",
      mode: "maintenance",
    },
  ]);
  assert.equal(result.requiresMaintenance, true);

  const cli = spawnSync(process.execPath, [
    SCRIPT_PATH,
    "--cwd", root,
    "--base", baseSha,
    "--head", headSha,
  ], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), result);
});

test("repository check aggregates missing markers and expand violations", (t) => {
  const { root, baseSha } = repositoryFixture(t);
  write(root, "prisma/migrations/20260716000000_missing/migration.sql", "SELECT 1;\n");
  write(
    root,
    "prisma/migrations/20260716000001_destructive/migration.sql",
    "-- workspace:migration-mode=expand\nDROP TABLE historical;\n",
  );
  const headSha = commit(root, "unsafe migrations");
  assert.throws(
    () => checkMigrationPolicy({ cwd: root, baseSha, headSha }),
    (error) => {
      assert.match(error.message, /20260716000000_missing/);
      assert.match(error.message, /first non-empty line must be/);
      assert.match(error.message, /20260716000001_destructive/);
      assert.match(error.message, /\[drop-table\]/);
      return true;
    },
  );
});

test("repository check fails closed for deleted migrations and invalid refs", (t) => {
  const { root, baseSha } = repositoryFixture(t);
  fs.rmSync(path.join(root, "prisma/migrations/20200101000000_historical/migration.sql"));
  const headSha = commit(root, "delete migration");
  assert.throws(
    () => checkMigrationPolicy({ cwd: root, baseSha, headSha }),
    /migration deletion is not allowed/,
  );
  assert.throws(
    () => checkMigrationPolicy({ cwd: root, baseSha: "HEAD", headSha }),
    /full lowercase 40-character Git SHA/,
  );
  assert.throws(
    () => checkMigrationPolicy({ cwd: root, baseSha: "a".repeat(40), headSha }),
    /git rev-parse .* failed/,
  );
});

test("repository check forbids modifying a migration from the trusted base", (t) => {
  const { root, baseSha } = repositoryFixture(t);
  write(
    root,
    "prisma/migrations/20200101000000_historical/migration.sql",
    "-- workspace:migration-mode=expand\nCREATE TABLE historical (id BIGINT);\n",
  );
  const headSha = commit(root, "modify historical migration");
  assert.throws(
    () => checkMigrationPolicy({ cwd: root, baseSha, headSha }),
    /migration modification is not allowed after it enters the trusted base/,
  );
});

test("repository check forbids backfilled migration timestamps", (t) => {
  const { root, baseSha } = repositoryFixture(t);
  write(
    root,
    "prisma/migrations/20191231235959_late_backfill/migration.sql",
    "-- workspace:migration-mode=expand\nCREATE TABLE late_backfill (id INTEGER);\n",
  );
  const headSha = commit(root, "backfill migration");
  assert.throws(
    () => checkMigrationPolicy({ cwd: root, baseSha, headSha }),
    /must sort after trusted base maximum/,
  );
});
