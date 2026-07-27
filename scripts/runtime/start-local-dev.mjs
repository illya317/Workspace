#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LOCAL_DEV_PORT = 3000;

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lockPath = path.join(repositoryRoot, ".cache/runtime/local-dev-server.lock");
const nextCliPath = path.join(repositoryRoot, "node_modules/next/dist/bin/next");
const prismaCliPath = path.join(repositoryRoot, "node_modules/prisma/build/index.js");
const workspaceCheckPath = path.join(repositoryRoot, "scripts/check/check-workspace-runtime.js");

export function assertFixedDevArguments(args) {
  if (args.length === 0) return;

  throw new Error(
    `Workspace 本地开发固定使用 ${LOCAL_DEV_PORT} 端口，禁止传入启动参数或改用其他端口。请直接运行 npm run dev。`,
  );
}

export function occupiedPortMessage(port = LOCAL_DEV_PORT) {
  return `端口 ${port} 已有实例运行。请复用现有 Workspace dev server；如果占用者不是 Workspace，请先处理该进程，禁止改用其他端口。`;
}

export async function isPortAvailable(port = LOCAL_DEV_PORT) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
    server.listen({ host: "0.0.0.0", port, exclusive: true });
  });
}

async function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    return true;
  }
}

async function removeLockIfOwned() {
  try {
    const owner = Number.parseInt(await fs.readFile(lockPath, "utf8"), 10);
    if (owner === process.pid) await fs.unlink(lockPath);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
}

async function acquireDevServerLock() {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const lock = await fs.open(lockPath, "wx");
      await lock.writeFile(`${process.pid}\n`);
      await lock.close();
      return removeLockIfOwned;
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;

      let owner = Number.NaN;
      try {
        owner = Number.parseInt(await fs.readFile(lockPath, "utf8"), 10);
      } catch (readError) {
        if (!readError || typeof readError !== "object" || !("code" in readError) || readError.code !== "ENOENT") {
          throw readError;
        }
      }

      if (await processIsRunning(owner)) throw new Error(occupiedPortMessage());

      try {
        await fs.unlink(lockPath);
      } catch (unlinkError) {
        if (!unlinkError || typeof unlinkError !== "object" || !("code" in unlinkError) || unlinkError.code !== "ENOENT") {
          throw unlinkError;
        }
      }
    }
  }

  throw new Error("无法取得本地开发服务锁，请确认没有其他 npm run dev 正在启动。");
}

async function runWorkspacePreflight() {
  const child = spawn(process.execPath, [workspaceCheckPath], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) {
    throw new Error("Workspace 私有配置检查未通过，本地服务未启动；先完成 npm run workspace:init、租户配置和 npm run workspace:check。");
  }
}

async function runDevelopmentMigrations() {
  const child = spawn(
    process.execPath,
    [prismaCliPath, "migrate", "deploy", "--schema=./prisma"],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) {
    throw new Error(
      "Workspace 本地数据库 migration 未完成，dev server 未启动；请检查 DATABASE_URL、DIRECT_URL 和 Prisma migration 状态。",
    );
  }
}

async function runNextDev() {
  const child = spawn(process.execPath, [nextCliPath, "dev", "--port", String(LOCAL_DEV_PORT)], {
    cwd: repositoryRoot,
    env: { ...process.env, PORT: String(LOCAL_DEV_PORT) },
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

export async function main(args = process.argv.slice(2)) {
  assertFixedDevArguments(args);

  if (!(await isPortAvailable())) throw new Error(occupiedPortMessage());

  const releaseLock = await acquireDevServerLock();
  try {
    if (!(await isPortAvailable())) throw new Error(occupiedPortMessage());

    await runWorkspacePreflight();
    await runDevelopmentMigrations();
    await fs.rm(path.join(repositoryRoot, ".next"), { recursive: true, force: true });
    const result = await runNextDev();
    if (result.code !== null) return result.code;
    if (result.signal === "SIGINT") return 130;
    if (result.signal === "SIGTERM") return 143;
    return 1;
  } finally {
    await releaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
