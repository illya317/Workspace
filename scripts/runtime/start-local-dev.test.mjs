import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
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

test("local dev applies committed migrations before clearing the Next build", () => {
  const source = readFileSync(new URL("./start-local-dev.mjs", import.meta.url), "utf8");
  assert.match(
    source,
    /await runWorkspacePreflight\(\);\n\s+await runDevelopmentMigrations\(\);\n\s+await fs\.rm\(path\.join\(repositoryRoot, "\.next"\)/,
  );
  assert.match(source, /prismaCliPath, "migrate", "deploy", "--schema=\.\/prisma"/);
  assert.match(source, /本地数据库 migration 未完成，dev server 未启动/);
});
