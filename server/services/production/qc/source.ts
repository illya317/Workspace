import "server-only";
import path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { access } from "fs/promises";
import type { QcSourceStatus } from "./types";

const execFile = promisify(execFileCallback);

async function readGitMetadata(root: string): Promise<Pick<QcSourceStatus, "gitAvailable" | "revision" | "dirty" | "changedFileCount" | "changedFiles">> {
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
      gitAvailable: true,
      revision: revisionResult.stdout.trim() || undefined,
      dirty: changedFiles.length > 0,
      changedFileCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, 12),
    };
  } catch {
    return { gitAvailable: false };
  }
}

export async function resolvePharmaOpsRoot() {
  const cwd = process.cwd();
  const workspaceConfigDir = process.env.WORKSPACE_CONFIG_DIR?.trim() || undefined;
  const workspaceConfigRoot = workspaceConfigDir
    ? path.join(workspaceConfigDir, "config", "pharma-qc")
    : undefined;
  const localRoots = [
    cwd,
    // Production runs from .next/standalone while rsync keeps repo files two levels up.
    path.resolve(cwd, "..", ".."),
  ];
  const localSnapshots = localRoots.map((root) => ({ root, configRoot: path.join(root, "config", "pharma-qc") }));
  const externalRoots = [
    path.resolve(cwd, "..", ".workspace"),
    path.resolve(cwd, "..", "..", ".workspace"),
  ].filter(Boolean) as string[];
  const candidates = [
    ...(process.env.WORKSPACE_QC_CONFIG_ROOT
      ? [{ root: path.dirname(process.env.WORKSPACE_QC_CONFIG_ROOT), configRoot: process.env.WORKSPACE_QC_CONFIG_ROOT }]
      : []),
    ...(workspaceConfigDir && workspaceConfigRoot
      ? [{ root: workspaceConfigDir, configRoot: workspaceConfigRoot }]
      : []),
    ...localSnapshots,
    ...externalRoots.map((root) => ({ root, configRoot: path.join(root, "config", "pharma-qc") })),
  ].filter((candidate, index, all) => all.findIndex((item) => item.configRoot === candidate.configRoot) === index);

  for (const { root, configRoot } of candidates) {
    try {
      await access(path.join(configRoot, "product_stage_tests.json"));
      return { root, configRoot, available: true, ...(await readGitMetadata(root)) };
    } catch {
      // Try the next known deployment shape.
    }
  }

  const root = localSnapshots[0]?.root ?? cwd;
  return {
    root,
    configRoot: workspaceConfigRoot ?? localSnapshots[0]?.configRoot ?? path.join(root, "config", "pharma-qc"),
    available: false,
    message: "未找到 pharma-qc 配置，请检查 WORKSPACE_CONFIG_DIR/config/pharma-qc 或设置 WORKSPACE_QC_CONFIG_ROOT。",
  };
}
