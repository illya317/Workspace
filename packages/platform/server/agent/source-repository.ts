import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { link, lstat, mkdir, open, realpath, rename, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getTenantConfig } from "../tenant-config";

import type { SourceRepositoryReader } from "./source-route-context";
import {
  sourceRepositoryErrorCode as errorCode,
  sourceRepositoryLstat as pathLstat,
} from "./source-repository-fs";
const execFile = promisify(execFileCallback);
const DEFAULT_BRANCH = "main";
const MAX_FILE_BYTES = 260_000;
const CACHE_OWNER = "workspace-agent-source-cache";
const CACHE_MARKER_FILE = ".workspace-agent-source-cache.json";
const CACHE_MARKER_VERSION = 1;
const CACHE_LOCK_SUFFIX = ".workspace-agent-source.lock";
const CACHE_LOCK_TIMEOUT_MS = 70_000;
const CACHE_LOCK_RETRY_MS = 50;
const CACHE_LOCK_UNKNOWN_GRACE_MS = 500;
const CACHE_LOCK_OWNER = "workspace-agent-source-cache-lock";
const CACHE_LOCK_VERSION = 1;
const CACHE_LOCK_DEAD_PROCESS_GRACE_MS = 5_000;
const CACHE_LOCK_HARD_TTL_MS = 5 * 60_000;
const processCacheLocks = new Map<string, Promise<void>>();
type CacheMarker = {
  owner: typeof CACHE_OWNER; version: typeof CACHE_MARKER_VERSION; repository: string;
};
type CacheLockRecord = {
  owner: typeof CACHE_LOCK_OWNER;
  version: typeof CACHE_LOCK_VERSION;
  token: string;
  pid: number;
  createdAt: string;
};
type CacheLockSnapshot = { record: CacheLockRecord; dev: number; ino: number };
type UnknownCacheLockSnapshot = {
  kind: "malformed" | "foreign" | "unsafe";
  dev?: number;
  ino?: number;
  mtimeMs?: number;
  size?: number;
};
type CacheLockInspection =
  | { kind: "missing" }
  | { kind: "owned"; snapshot: CacheLockSnapshot }
  | UnknownCacheLockSnapshot;
export type SourceSnapshot = {
  repoDir: string;
  repoUrl: string;
  branch: string;
  commit: string;
  mode: "remote" | "local";
  dirtySummary?: string;
  reader: SourceRepositoryReader;
  listFiles(): Promise<string[]>;
};
function workspaceConfigDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) throw new Error(`WORKSPACE_CONFIG_DIR must be absolute: ${configured}`);
    return configured;
  }
  return path.join(os.tmpdir(), "workspace-agent-source");
}
function sourceRepoUrl() {
  return process.env.AGENT_SOURCE_REPO_URL?.trim() || getTenantConfig().manifest.sourceRepository;
}
function sourceBranch() {
  return process.env.AGENT_SOURCE_BRANCH?.trim() || DEFAULT_BRANCH;
}
function cacheDir() {
  const configured = process.env.AGENT_SOURCE_CACHE_DIR?.trim();
  if (!configured) return path.join(workspaceConfigDir(), "agent-source", "Workspace");
  if (!path.isAbsolute(configured)) throw new Error(`AGENT_SOURCE_CACHE_DIR must be absolute: ${configured}`);
  return configured;
}

function sourceWorktreeDir() {
  const configured = process.env.AGENT_SOURCE_WORKTREE?.trim();
  if (!configured) return null;
  if (!path.isAbsolute(configured)) throw new Error(`AGENT_SOURCE_WORKTREE must be absolute: ${configured}`);
  return configured;
}

async function runGit(args: string[], options: { cwd?: string; timeout?: number } = {}) {
  try {
    const { stdout } = await execFile("git", args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 10_000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return String(stdout).trim();
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(redactConfiguredRepositoryUrl(
      [failure.message, failure.stdout, failure.stderr].filter(Boolean).join("\n"),
    ));
  }
}

function isStrictlyInside(root: string, target: string) {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function safeFile(repoRoot: string, file: string) {
  if (!file || path.isAbsolute(file)) return null;
  // The repository is an operator-configured runtime checkout. It is never a
  // build input, so Turbopack must not expand this dynamic path into the app's
  // output-file trace (which would otherwise pull the whole monorepo).
  const absolute = path.resolve(/* turbopackIgnore: true */ repoRoot, file);
  if (!isStrictlyInside(repoRoot, absolute)) return null;

  const fileStat = await pathLstat(absolute);
  if (!fileStat?.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_FILE_BYTES) return null;

  const canonicalFile = await realpath(absolute).catch(() => null);
  if (!canonicalFile || !isStrictlyInside(repoRoot, canonicalFile) || canonicalFile !== absolute) return null;
  return { absolute, fileStat };
}

async function createSourceReader(repoDir: string): Promise<SourceRepositoryReader> {
  const repoRoot = await realpath(repoDir);
  const repoStat = await lstat(repoRoot);
  if (!repoStat.isDirectory() || repoStat.isSymbolicLink()) throw new Error(`Source repository is not a canonical directory: ${repoDir}`);

  return {
    async exists(file) {
      return Boolean(await safeFile(repoRoot, file));
    },
    async readText(file) {
      const candidate = await safeFile(repoRoot, file);
      if (!candidate) return null;

      const handle = await open(candidate.absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW).catch(() => null);
      if (!handle) return null;
      try {
        const openedStat = await handle.stat();
        if (
          !openedStat.isFile()
          || openedStat.size > MAX_FILE_BYTES
          || openedStat.dev !== candidate.fileStat.dev
          || openedStat.ino !== candidate.fileStat.ino
        ) return null;
        return await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
    },
  };
}

async function listSourceFiles(repoDir: string, mode: SourceSnapshot["mode"]) {
  const tracked = (await runGit(["ls-files"], { cwd: repoDir, timeout: 8_000 })).split("\n");
  if (mode !== "local") return tracked.filter(Boolean);
  const untracked = (await runGit(["ls-files", "--others", "--exclude-standard"], { cwd: repoDir, timeout: 8_000 }).catch(() => ""))
    .split("\n");
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

async function resolveLocalSourceRepo(worktreeDir: string): Promise<SourceSnapshot> {
  const resolved = await realpath(worktreeDir);
  const gitRoot = await runGit(["rev-parse", "--show-toplevel"], { cwd: resolved, timeout: 5_000 });
  const repoDir = await realpath(gitRoot);
  const commit = await runGit(["rev-parse", "HEAD"], { cwd: repoDir, timeout: 5_000 });
  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoDir, timeout: 5_000 }).catch(() => "HEAD");
  const dirtySummary = await runGit(["status", "--porcelain"], { cwd: repoDir, timeout: 5_000 }).catch(() => "");
  const reader = await createSourceReader(repoDir);
  return {
    repoDir,
    repoUrl: "local-worktree",
    branch,
    commit,
    mode: "local",
    dirtySummary: dirtySummary ? dirtySummary.split("\n").slice(0, 40).join("\n") : undefined,
    reader,
    listFiles: () => listSourceFiles(repoDir, "local"),
  };
}

function canonicalRepositoryIdentity(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\.git$/i, "");
  }
}

function redactConfiguredRepositoryUrl(value: string) {
  const configured = process.env.AGENT_SOURCE_REPO_URL?.trim();
  return configured ? value.split(configured).join(canonicalRepositoryIdentity(configured)) : value;
}

async function validateBranch(branch: string) {
  if (!branch) throw new Error("AGENT_SOURCE_BRANCH cannot be empty");
  const validated = await runGit(["check-ref-format", "--branch", branch], { timeout: 5_000 });
  if (validated !== branch) throw new Error(`AGENT_SOURCE_BRANCH is invalid: ${branch}`);
}

async function canonicalCacheTarget(configuredDir: string) {
  const absolute = path.resolve(/* turbopackIgnore: true */ configuredDir);
  await mkdir(path.dirname(absolute), { recursive: true });
  const canonicalParent = await realpath(path.dirname(absolute));
  return path.join(canonicalParent, path.basename(absolute));
}

async function readCacheMarker(repoDir: string): Promise<CacheMarker> {
  const markerPath = path.join(repoDir, CACHE_MARKER_FILE);
  const markerStat = await pathLstat(markerPath);
  if (!markerStat?.isFile() || markerStat.isSymbolicLink() || markerStat.size > 4_096) {
    throw new Error(`Refusing unowned Agent source cache: ${repoDir}`);
  }
  const canonicalMarker = await realpath(markerPath).catch(() => null);
  if (!canonicalMarker || canonicalMarker !== markerPath || !isStrictlyInside(repoDir, canonicalMarker)) {
    throw new Error(`Refusing unsafe Agent source cache marker: ${repoDir}`);
  }

  const handle = await open(markerPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW).catch(() => null);
  if (!handle) throw new Error(`Refusing unsafe Agent source cache marker: ${repoDir}`);

  let serialized: string;
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile()
      || opened.dev !== markerStat.dev
      || opened.ino !== markerStat.ino
      || opened.size > 4_096
    ) throw new Error(`Refusing changed Agent source cache marker: ${repoDir}`);
    serialized = await handle.readFile("utf8");
  } finally {
    await handle.close();
  }

  let marker: Partial<CacheMarker>;
  try {
    marker = JSON.parse(serialized) as Partial<CacheMarker>;
  } catch {
    throw new Error(`Refusing invalid Agent source cache marker: ${repoDir}`);
  }
  if (marker.owner !== CACHE_OWNER || marker.version !== CACHE_MARKER_VERSION || typeof marker.repository !== "string") {
    throw new Error(`Refusing unowned Agent source cache: ${repoDir}`);
  }
  return marker as CacheMarker;
}

async function validateManagedCache(repoDir: string, expectedRepoUrl: string) {
  const repoStat = await pathLstat(repoDir);
  if (!repoStat?.isDirectory() || repoStat.isSymbolicLink()) {
    throw new Error(`Refusing non-directory Agent source cache: ${repoDir}`);
  }
  const canonicalRepoDir = await realpath(repoDir);
  if (canonicalRepoDir !== repoDir) throw new Error(`Refusing non-canonical Agent source cache: ${repoDir}`);

  const marker = await readCacheMarker(canonicalRepoDir);
  const expectedRepository = canonicalRepositoryIdentity(expectedRepoUrl);
  if (marker.repository !== expectedRepository) {
    throw new Error(`Refusing Agent source cache for a different repository: ${canonicalRepoDir}`);
  }

  const gitDir = path.join(/* turbopackIgnore: true */ canonicalRepoDir, ".git");
  const gitStat = await pathLstat(gitDir);
  if (!gitStat?.isDirectory() || gitStat.isSymbolicLink()) {
    throw new Error(`Refusing Agent source cache without a dedicated .git directory: ${canonicalRepoDir}`);
  }
  const topLevel = await realpath(await runGit(["rev-parse", "--show-toplevel"], { cwd: canonicalRepoDir, timeout: 5_000 }));
  if (topLevel !== canonicalRepoDir) throw new Error(`Refusing Agent source cache with a mismatched Git root: ${canonicalRepoDir}`);

  const origin = await runGit(["config", "--get", "remote.origin.url"], { cwd: canonicalRepoDir, timeout: 5_000 });
  if (canonicalRepositoryIdentity(origin) !== expectedRepository) {
    throw new Error(`Refusing Agent source cache with a mismatched origin: ${canonicalRepoDir}`);
  }
  return canonicalRepoDir;
}

async function writeCacheMarker(repoDir: string, repoUrl: string) {
  const marker: CacheMarker = {
    owner: CACHE_OWNER,
    version: CACHE_MARKER_VERSION,
    repository: canonicalRepositoryIdentity(repoUrl),
  };
  const handle = await open(path.join(repoDir, CACHE_MARKER_FILE), "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(marker)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function initializeManagedCache(repoDir: string, repoUrl: string, branch: string) {
  const temporaryDir = `${repoDir}.init-${process.pid}-${randomUUID()}`;
  try {
    await runGit(["clone", "--depth=1", "--no-tags", "--branch", branch, "--", repoUrl, temporaryDir], { timeout: 45_000 });
    const canonicalTemporaryDir = await realpath(temporaryDir);
    if (canonicalTemporaryDir !== temporaryDir) throw new Error(`Agent source cache clone resolved outside its target: ${repoDir}`);
    const topLevel = await realpath(await runGit(["rev-parse", "--show-toplevel"], { cwd: temporaryDir, timeout: 5_000 }));
    const origin = await runGit(["config", "--get", "remote.origin.url"], { cwd: temporaryDir, timeout: 5_000 });
    if (topLevel !== temporaryDir || canonicalRepositoryIdentity(origin) !== canonicalRepositoryIdentity(repoUrl)) {
      throw new Error(`Agent source cache clone verification failed: ${repoDir}`);
    }
    await writeCacheMarker(temporaryDir, repoUrl);
    if (await pathLstat(repoDir)) throw new Error(`Refusing to replace an existing Agent source cache path: ${repoDir}`);
    await rename(temporaryDir, repoDir);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

async function withProcessCacheLock<T>(key: string, task: () => Promise<T>) {
  const previous = processCacheLocks.get(key) ?? Promise.resolve();
  let releaseTurn!: () => void;
  const turn = new Promise<void>((resolve) => { releaseTurn = resolve; });
  const tail = previous.catch(() => undefined).then(() => turn);
  processCacheLocks.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    releaseTurn();
    if (processCacheLocks.get(key) === tail) processCacheLocks.delete(key);
  }
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

async function inspectCacheLock(lockPath: string): Promise<CacheLockInspection> {
  const initial = await pathLstat(lockPath);
  if (!initial) return { kind: "missing" };
  if (!initial.isFile() || initial.isSymbolicLink() || initial.size > 4_096) return { kind: "unsafe" };
  const handle = await open(lockPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW).catch(() => null);
  if (!handle) return { kind: "unsafe" };
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile()
      || opened.dev !== initial.dev
      || opened.ino !== initial.ino
      || opened.size > 4_096
    ) return { kind: "unsafe" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(await handle.readFile("utf8"));
    } catch {
      return { kind: "malformed", dev: opened.dev, ino: opened.ino, mtimeMs: opened.mtimeMs, size: opened.size };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return { kind: "malformed", dev: opened.dev, ino: opened.ino, mtimeMs: opened.mtimeMs, size: opened.size };
    }
    const record = parsed as Partial<CacheLockRecord>;
    if (typeof record.owner === "string" && (record.owner !== CACHE_LOCK_OWNER || record.version !== CACHE_LOCK_VERSION)) {
      return { kind: "foreign", dev: opened.dev, ino: opened.ino, mtimeMs: opened.mtimeMs, size: opened.size };
    }
    if (
      record.owner !== CACHE_LOCK_OWNER
      || record.version !== CACHE_LOCK_VERSION
      || typeof record.token !== "string"
      || record.token.length < 16
      || !Number.isInteger(record.pid)
      || Number(record.pid) <= 0
      || Number(record.pid) > 2_147_483_647
      || typeof record.createdAt !== "string"
      || !Number.isFinite(Date.parse(record.createdAt))
    ) return { kind: "malformed", dev: opened.dev, ino: opened.ino, mtimeMs: opened.mtimeMs, size: opened.size };
    return { kind: "owned", snapshot: { record: record as CacheLockRecord, dev: opened.dev, ino: opened.ino } };
  } finally {
    await handle.close();
  }
}

function sameCacheLock(left: CacheLockSnapshot, right: CacheLockSnapshot) {
  return left.dev === right.dev && left.ino === right.ino && left.record.token === right.record.token;
}

async function removeCacheLockIfOwned(lockPath: string, expected: CacheLockSnapshot) {
  const inspection = await inspectCacheLock(lockPath);
  if (inspection.kind !== "owned" || !sameCacheLock(inspection.snapshot, expected)) return false;
  const current = inspection.snapshot;
  const beforeUnlink = await pathLstat(lockPath);
  if (!beforeUnlink || beforeUnlink.dev !== current.dev || beforeUnlink.ino !== current.ino) return false;
  try {
    await unlink(lockPath);
    const candidatePath = `${lockPath}.${expected.record.token}.candidate`;
    const candidate = await pathLstat(candidatePath);
    if (candidate?.dev === expected.dev && candidate.ino === expected.ino) await unlink(candidatePath).catch(() => undefined);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function sameUnknownCacheLock(left: UnknownCacheLockSnapshot, right: UnknownCacheLockSnapshot) {
  return left.kind === right.kind
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size;
}

async function removeMalformedCacheLockIfExpired(lockPath: string, expected: UnknownCacheLockSnapshot) {
  if (expected.kind !== "malformed" || expected.mtimeMs === undefined) return false;
  if (Date.now() - expected.mtimeMs < CACHE_LOCK_HARD_TTL_MS) return false;
  const current = await inspectCacheLock(lockPath);
  if (current.kind !== "malformed" || !sameUnknownCacheLock(current, expected)) return false;
  const beforeUnlink = await pathLstat(lockPath);
  if (!beforeUnlink || beforeUnlink.dev !== current.dev || beforeUnlink.ino !== current.ino) return false;
  try {
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

async function reclaimStaleCacheLock(lockPath: string, snapshot: CacheLockSnapshot) {
  const ageMs = Date.now() - Date.parse(snapshot.record.createdAt);
  const staleDeadProcess = ageMs >= CACHE_LOCK_DEAD_PROCESS_GRACE_MS && !processIsAlive(snapshot.record.pid);
  const staleExpiredLease = ageMs >= CACHE_LOCK_HARD_TTL_MS;
  if (!staleDeadProcess && !staleExpiredLease) return false;
  return removeCacheLockIfOwned(lockPath, snapshot);
}

async function tryCreateCacheLock(lockPath: string, record: CacheLockRecord) {
  const candidatePath = `${lockPath}.${record.token}.candidate`;
  const handle = await open(candidatePath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
    await handle.sync();
    const candidateStat = await handle.stat();
    await handle.close();
    try {
      await link(candidatePath, lockPath);
      return { record, dev: candidateStat.dev, ino: candidateStat.ino } satisfies CacheLockSnapshot;
    } catch (error) {
      if (errorCode(error) === "EEXIST") return null;
      throw error;
    }
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(candidatePath).catch(() => undefined);
  }
}

async function acquireCacheFileLock(repoDir: string) {
  const lockPath = `${repoDir}${CACHE_LOCK_SUFFIX}`;
  const deadline = Date.now() + CACHE_LOCK_TIMEOUT_MS;
  let unknownLockSince: number | null = null;
  while (true) {
    const record: CacheLockRecord = {
      owner: CACHE_LOCK_OWNER,
      version: CACHE_LOCK_VERSION,
      token: randomUUID(),
      pid: process.pid,
      createdAt: new Date().toISOString(),
    };
    const ownedLock = await tryCreateCacheLock(lockPath, record);
    if (ownedLock) {
      return async () => {
        await removeCacheLockIfOwned(lockPath, ownedLock).catch(() => false);
      };
    }

    const inspection = await inspectCacheLock(lockPath);
    if (inspection.kind === "missing") continue;
    if (inspection.kind === "owned") {
      unknownLockSince = null;
      if (await reclaimStaleCacheLock(lockPath, inspection.snapshot)) continue;
    } else {
      if (inspection.kind === "malformed" && await removeMalformedCacheLockIfExpired(lockPath, inspection)) continue;
      if (inspection.kind === "malformed" || inspection.kind === "foreign" || inspection.kind === "unsafe") {
        unknownLockSince ??= Date.now();
        if (Date.now() - unknownLockSince >= CACHE_LOCK_UNKNOWN_GRACE_MS) {
          throw new Error(`Refusing an unrecognized Agent source cache lock: ${lockPath}`);
        }
      }
    }
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for Agent source cache lock: ${repoDir}`);
    await new Promise((resolve) => setTimeout(resolve, CACHE_LOCK_RETRY_MS));
  }
}

async function ensureRemoteSourceRepo(): Promise<SourceSnapshot> {
  const repoUrl = sourceRepoUrl();
  const repositoryIdentity = canonicalRepositoryIdentity(repoUrl);
  const branch = sourceBranch();
  await validateBranch(branch);
  const repoDir = await canonicalCacheTarget(cacheDir());

  return withProcessCacheLock(repoDir, async () => {
    const releaseFileLock = await acquireCacheFileLock(repoDir);
    try {
      const existing = await pathLstat(repoDir);
      if (!existing) await initializeManagedCache(repoDir, repoUrl, branch);
      else await validateManagedCache(repoDir, repoUrl);

      const canonicalRepoDir = await validateManagedCache(repoDir, repoUrl);
      await runGit(["fetch", "--depth=1", "--no-tags", "origin", branch], { cwd: canonicalRepoDir, timeout: 20_000 });
      await validateManagedCache(canonicalRepoDir, repoUrl);
      await runGit(["reset", "--hard", "FETCH_HEAD"], { cwd: canonicalRepoDir, timeout: 10_000 });
      await validateManagedCache(canonicalRepoDir, repoUrl);

      const commit = await runGit(["rev-parse", "HEAD"], { cwd: canonicalRepoDir, timeout: 5_000 });
      const reader = await createSourceReader(canonicalRepoDir);
      return {
        repoDir: canonicalRepoDir,
        repoUrl: repositoryIdentity,
        branch,
        commit,
        mode: "remote" as const,
        reader,
        listFiles: () => listSourceFiles(canonicalRepoDir, "remote"),
      };
    } finally {
      await releaseFileLock();
    }
  });
}

export async function resolveSourceRepo(): Promise<SourceSnapshot> {
  const worktreeDir = sourceWorktreeDir();
  if (worktreeDir) return resolveLocalSourceRepo(worktreeDir);
  return ensureRemoteSourceRepo();
}
