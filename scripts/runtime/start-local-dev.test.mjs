import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertRuntimeDatabaseEnvironment,
  assertFixedDevArguments,
  LOCAL_DEV_PORT,
  occupiedPortMessage,
} from "./start-local-dev.mjs";

test("local dev port is fixed to 3000", () => {
  assert.equal(LOCAL_DEV_PORT, 3000);
  assert.doesNotThrow(() => assertFixedDevArguments([]));
});

test("local dev rejects forwarded npm arguments", () => {
  assert.throws(() => assertFixedDevArguments(["--port", "3100"]), /固定使用 3000 端口/);
  assert.throws(() => assertFixedDevArguments(["-p", "3100"]), /禁止传入启动参数/);
  assert.throws(() => assertFixedDevArguments(["--hostname", "127.0.0.1"]), /请直接运行 npm run dev/);
});

test("occupied port guidance forbids switching ports", () => {
  assert.match(occupiedPortMessage(), /复用现有 Workspace dev server/);
  assert.match(occupiedPortMessage(), /禁止改用其他端口/);
});

test("long-running local dev accepts only the runtime database URL", () => {
  assert.doesNotThrow(() =>
    assertRuntimeDatabaseEnvironment({
      DATABASE_URL: "postgresql://workspace_dev_runtime:secret@db:5432/workspace_dev",
    }),
  );
  assert.throws(() => assertRuntimeDatabaseEnvironment({}), /必须通过 DATABASE_URL 使用 PostgreSQL runtime 账号/);
  assert.throws(
    () => assertRuntimeDatabaseEnvironment({ DATABASE_URL: "file:./workspace.db" }),
    /必须通过 DATABASE_URL 使用 PostgreSQL runtime 账号/,
  );
});

test("long-running local dev rejects migration credentials", () => {
  const runtime = "postgresql://workspace_dev_runtime:secret@db:5432/workspace_dev";
  assert.throws(
    () => assertRuntimeDatabaseEnvironment({ DATABASE_URL: runtime, DIRECT_URL: runtime }),
    /禁止持有迁移凭据：DIRECT_URL/,
  );
  assert.throws(
    () => assertRuntimeDatabaseEnvironment({ DATABASE_URL: runtime, SHADOW_DATABASE_URL: runtime }),
    /禁止持有迁移凭据：SHADOW_DATABASE_URL/,
  );
});

test("local dev materializes source analysis before starting Next without migrating", () => {
  const source = readFileSync(new URL("./start-local-dev.mjs", import.meta.url), "utf8");
  assert.match(
    source,
    /await runSourceCodeAnalysisSnapshot\(\);\n\s+await runWorkspacePreflight\(\);\n\s+await fs\.rm\(path\.join\(repositoryRoot, "\.next"\)/,
  );
  assert.doesNotMatch(source, /prismaCliPath|runDevelopmentMigrations|"migrate", "deploy"/);
  assert.match(source, /source-code-analysis\/cli\.ts/);
  assert.match(source, /runSourceCodeAnalysisSnapshot\(mode = "--write"\)/);
  assert.match(source, /sourceCodeAnalysisPath, mode/);
  assert.match(source, /runSourceCodeAnalysisSnapshot\("--ensure"\)/);
  assert.match(source, /生成物目录和文件必须可从当前源码自动建立/);
  assert.match(source, /WORKSPACE_RUNTIME_DATABASE_ONLY: "1"/);
  assert.doesNotMatch(source, /--optional/);
  assert.match(source, /return superviseNextDev\(/);
  assert.equal(source.match(/assertRuntimeDatabaseEnvironment\(\);/g)?.length, 1);
  assert.equal(source.match(/await runSourceCodeAnalysisSnapshot\(\);/g)?.length, 1);
  assert.equal(source.match(/await fs\.rm\(path\.join\(repositoryRoot, "\.next"\)/g)?.length, 1);
});
