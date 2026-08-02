import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRestartLease, parseDuration } from "./local-dev-guard.mjs";
import { pendingRestartStillAllowed } from "./local-dev-supervisor.mjs";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

function portAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    server.listen({ host: "0.0.0.0", port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
}

async function waitUntil(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for supervisor fixture state.");
}

test("supervisor forwards shutdown to the exact child tree and releases the port", async (t) => {
  const repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-dev-supervisor-"));
  t.after(() => fs.rm(repositoryRoot, { recursive: true, force: true }));
  const port = await freePort();
  const fakeNextPath = path.join(repositoryRoot, "fake-next.mjs");
  const workerPath = path.join(repositoryRoot, "worker.mjs");
  const supervisorUrl = new URL("./local-dev-supervisor.mjs", import.meta.url).href;

  await fs.writeFile(
    fakeNextPath,
    'import net from "node:net"; const server = net.createServer(); server.listen(Number(process.env.PORT), "0.0.0.0"); process.on("SIGTERM", () => server.close(() => process.exit(0)));\n',
  );
  await fs.writeFile(
    workerPath,
    `import net from "node:net";\nimport { superviseNextDev } from ${JSON.stringify(supervisorUrl)};\n` +
      `const port = ${port};\n` +
      `const available = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", (error) => error.code === "EADDRINUSE" ? resolve(false) : reject(error)); server.listen({host:"0.0.0.0",port,exclusive:true}, () => server.close((error) => error ? reject(error) : resolve(true))); });\n` +
      `await superviseNextDev({repositoryRoot:${JSON.stringify(repositoryRoot)},nextCliPath:${JSON.stringify(fakeNextPath)},port,isPortAvailable:available});\n`,
  );

  const worker = spawn(process.execPath, [workerPath], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  worker.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  await waitUntil(async () => !(await portAvailable(port)));
  worker.kill("SIGTERM");
  const result = await new Promise((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code, signal) => resolve({ code, signal }));
  });

  assert.deepEqual(result, { code: 0, signal: null }, stderr);
  await waitUntil(() => portAvailable(port));
  const status = JSON.parse(
    await fs.readFile(path.join(repositoryRoot, ".cache/runtime/local-dev-status.json"), "utf8"),
  );
  assert.equal(status.state, "stopped");
  assert.equal(status.generation, 1);
});

test("an agent lease cancels a pending automatic restart", async (t) => {
  const repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-dev-pending-"));
  t.after(() => fs.rm(repositoryRoot, { recursive: true, force: true }));
  const controller = new AbortController();
  const context = {
    generation: 4,
    child: { pid: 123 },
    childStartedAt: Date.now(),
    serverPid: 456,
    thresholds: { softBytes: 1, hardBytes: 2 },
    activeLeases: [],
    lastSample: { footprintBytes: 3 },
    guardState: { state: "restart_pending", hardConsecutive: 2, softConsecutive: 2, action: "restart" },
  };
  setTimeout(() => {
    void createRestartLease(repositoryRoot, {
      durationMs: parseDuration("1m"),
      reason: "sensitive agent operation",
    });
  }, 50);

  assert.equal(await pendingRestartStillAllowed(repositoryRoot, controller, context), false);
  assert.equal(context.guardState.state, "suppressed");
  assert.equal(context.guardState.hardConsecutive, 0);
});
