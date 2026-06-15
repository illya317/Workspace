import "server-only";
import path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { access } from "fs/promises";
import type { QcSourceStatus } from "./types";

const execFile = promisify(execFileCallback);

async function readGitMetadata(root: string): Promise<Pick<QcSourceStatus, "revision" | "dirty" | "changedFileCount" | "changedFiles">> {
  try {
    const [revisionResult, statusResult] = await Promise.all([
      execFile("git", ["-C", root, "rev-parse", "--short", "HEAD"], { timeout: 1500 }),
      execFile("git", ["-C", root, "status", "--porcelain"], { timeout: 1500 }),
    ]);
    const changedFiles = statusResult.stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => line.slice(3).replace(/^.* -> /, ""));

    return {
      revision: revisionResult.stdout.trim() || undefined,
      dirty: changedFiles.length > 0,
      changedFileCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, 12),
    };
  } catch {
    return {};
  }
}

export async function resolvePharmaOpsRoot() {
  const cwd = process.cwd();
  const candidates = [
    process.env.PHARMA_OPS_ROOT,
    path.resolve(cwd, "..", "pharma-ops"),
    path.resolve(cwd, "..", "..", "pharma-ops"),
    path.resolve(cwd, "..", "..", "..", "pharma-ops"),
  ].filter(Boolean) as string[];

  for (const root of candidates) {
    const configRoot = path.join(root, "config");
    try {
      await access(configRoot);
      return { root, configRoot, available: true, ...(await readGitMetadata(root)) };
    } catch {
      // Try the next known deployment shape.
    }
  }

  const root = candidates[0] ?? path.resolve(cwd, "..", "pharma-ops");
  return {
    root,
    configRoot: path.join(root, "config"),
    available: false,
    message: "未找到 pharma-ops/config，请设置 PHARMA_OPS_ROOT。",
  };
}
