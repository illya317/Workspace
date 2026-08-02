import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  findStandaloneServer,
  parsePlaywrightPort,
  prepareStandaloneAssets,
  standaloneServerEnvironment,
  validateArchiveEntryList,
  verifyStandaloneArchive,
} from "./e2e-standalone.mjs";

async function unusedPort() {
  const server = createServer();
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
  } catch (error) {
    if (error?.code === "EPERM") return null;
    throw error;
  }
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  return port;
}

function extractedRuntimeDirectories() {
  return new Set(fs.readdirSync(os.tmpdir())
    .filter((entry) => entry.startsWith("workspace-e2e-runtime-")));
}

test("parsePlaywrightPort accepts valid ports and rejects unsafe values", () => {
  assert.equal(parsePlaywrightPort("3100"), 3100);
  for (const value of ["0", "65536", "3.5", "not-a-port", ""]) {
    assert.throws(() => parsePlaywrightPort(value), /PLAYWRIGHT_PORT/);
  }
});

test("standalone E2E routes production internal RPC back through its own public origin", () => {
  assert.equal(
    standaloneServerEnvironment({}, 3100).WORKSPACE_PUBLIC_ORIGIN,
    "http://127.0.0.1:3100",
  );
  assert.equal(
    standaloneServerEnvironment({ WORKSPACE_PUBLIC_ORIGIN: "https://workspace.example.test" }, 3100)
      .WORKSPACE_PUBLIC_ORIGIN,
    "https://workspace.example.test",
  );
});

test("prepareStandaloneAssets finds a nested server and copies static/public assets", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-e2e-standalone-"));
  context.after(() => fs.rmSync(root, { force: true, recursive: true }));

  const outputRoot = path.join(root, ".next/standalone");
  const appDirectory = path.join(outputRoot, "workspace/app");
  fs.mkdirSync(path.join(root, ".next/static/chunks"), { recursive: true });
  fs.mkdirSync(path.join(root, "public/assets"), { recursive: true });
  fs.mkdirSync(appDirectory, { recursive: true });
  fs.writeFileSync(path.join(appDirectory, "server.js"), "// fixture\n");
  fs.writeFileSync(path.join(root, ".next/static/chunks/app.js"), "static fixture\n");
  fs.writeFileSync(path.join(root, "public/assets/logo.txt"), "public fixture\n");

  const prepared = prepareStandaloneAssets({ root, outputRoot });

  assert.equal(prepared.serverPath, path.join(appDirectory, "server.js"));
  assert.equal(
    fs.readFileSync(path.join(appDirectory, ".next/static/chunks/app.js"), "utf8"),
    "static fixture\n",
  );
  assert.equal(
    fs.readFileSync(path.join(appDirectory, "public/assets/logo.txt"), "utf8"),
    "public fixture\n",
  );
});

test("findStandaloneServer ignores node_modules and rejects ambiguous output", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-e2e-server-"));
  context.after(() => fs.rmSync(root, { force: true, recursive: true }));

  fs.mkdirSync(path.join(root, "node_modules/dependency"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules/dependency/server.js"), "// ignored\n");
  assert.throws(() => findStandaloneServer(root), /found 0/);

  fs.mkdirSync(path.join(root, "app-a"), { recursive: true });
  fs.mkdirSync(path.join(root, "app-b"), { recursive: true });
  fs.writeFileSync(path.join(root, "app-a/server.js"), "// a\n");
  fs.writeFileSync(path.join(root, "app-b/server.js"), "// b\n");
  assert.throws(() => findStandaloneServer(root), /found 2/);
});

test("validateArchiveEntryList rejects traversal and absolute paths", () => {
  assert.deepEqual(
    validateArchiveEntryList("./\n./server.js\n./app/.next/static/chunk.js\n"),
    ["./", "./server.js", "./app/.next/static/chunk.js"],
  );
  for (const entry of ["../outside", "./app/../../outside", "/absolute", "C:/absolute"]) {
    assert.throws(() => validateArchiveEntryList(`${entry}\n`), /Unsafe path/);
  }
});

test("verifyStandaloneArchive validates manifest commit and digest", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-e2e-manifest-"));
  context.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const archivePath = path.join(root, "runtime.tgz");
  const manifestPath = path.join(root, "runtime.manifest.json");
  fs.writeFileSync(archivePath, "canonical artifact fixture\n");
  const digest = createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex");
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifact: { sha256: digest },
    source: { commitSha: "a".repeat(40) },
  }));

  await verifyStandaloneArchive({
    archivePath,
    manifestPath,
    expectedCommit: "a".repeat(40),
  });
  await assert.rejects(
    verifyStandaloneArchive({
      archivePath,
      manifestPath,
      expectedCommit: "b".repeat(40),
    }),
    /manifest commit/,
  );
  await assert.rejects(
    verifyStandaloneArchive({
      archivePath,
      expectedDigest: "0".repeat(64),
    }),
    /archive SHA-256/,
  );
});

test("archive runner starts the extracted server and removes its temporary runtime", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-e2e-runner-"));
  context.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const runtimeRoot = path.join(root, "runtime");
  const archivePath = path.join(root, "runtime.tgz");
  const manifestPath = path.join(root, "runtime.manifest.json");
  fs.mkdirSync(path.join(runtimeRoot, ".next/static"), { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, "server.js"), `
const http = require("node:http");
const server = http.createServer((_request, response) => response.end("ready"));
server.listen(Number(process.env.PORT), process.env.HOSTNAME);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
`);
  const tarResult = spawnSync("tar", ["-czf", archivePath, "-C", runtimeRoot, "."]);
  assert.equal(tarResult.status, 0, tarResult.stderr?.toString());
  const digest = createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex");
  fs.writeFileSync(manifestPath, JSON.stringify({
    artifact: { sha256: digest },
    source: { commitSha: "a".repeat(40) },
  }));

  const port = await unusedPort();
  if (port === null) {
    context.skip("sandbox denies localhost listeners (listen EPERM)");
    return;
  }
  const before = extractedRuntimeDirectories();
  const runner = spawn(process.execPath, [
    fileURLToPath(new URL("./e2e-standalone.mjs", import.meta.url)),
  ], {
    env: {
      ...process.env,
      PLAYWRIGHT_PORT: String(port),
      PLAYWRIGHT_STANDALONE_ARCHIVE: archivePath,
      PLAYWRIGHT_STANDALONE_COMMIT: "a".repeat(40),
      PLAYWRIGHT_STANDALONE_MANIFEST: manifestPath,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  runner.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  context.after(() => {
    if (runner.exitCode === null && runner.signalCode === null) runner.kill("SIGKILL");
  });

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok && await response.text() === "ready") {
        ready = true;
        break;
      }
    } catch {
      // The extracted server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(ready, true, stderr);

  runner.kill("SIGTERM");
  const [exitCode] = await once(runner, "exit");
  assert.equal(exitCode, 143, stderr);
  assert.deepEqual(extractedRuntimeDirectories(), before);
});
