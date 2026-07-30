import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateMarketHistoryCacheWrite } from "./domain/market-cache-validation";

const CACHE_VERSION = 1;
const MAX_CACHE_FILES = 512;
const MAX_CACHE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ROWS = 5_000;

type MarketHistoryCacheFile = {
  version: typeof CACHE_VERSION;
  key: string;
  expiresAt: number;
  rows: Record<string, unknown>[];
};

type CacheOptions = {
  cacheDir?: string | null;
  now?: number;
};

export function marketHistoryCacheDirectory(env: NodeJS.ProcessEnv = process.env) {
  const explicit = env.MARKET_INTELLIGENCE_CACHE_DIR?.trim();
  if (explicit) return path.isAbsolute(explicit) ? explicit : null;
  const workspaceRoot = env.WORKSPACE_CONFIG_DIR?.trim();
  return workspaceRoot && path.isAbsolute(workspaceRoot)
    ? path.join(workspaceRoot, "cache", "capital-securities", "market-intelligence")
    : null;
}

export async function readMarketHistoryCache(key: string, options: CacheOptions = {}) {
  const cacheDir = resolvedCacheDirectory(options);
  if (!cacheDir) return null;
  const filePath = cacheFilePath(cacheDir, key);
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_CACHE_FILE_BYTES) return null;
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (!validCacheFile(parsed, key)) return null;
    if (parsed.expiresAt <= (options.now ?? Date.now())) {
      await unlink(filePath).catch(() => undefined);
      return null;
    }
    return { rows: parsed.rows, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export async function writeMarketHistoryCache(
  key: string,
  rows: readonly Record<string, unknown>[],
  expiresAt: number,
  options: CacheOptions = {},
) {
  const cacheDir = resolvedCacheDirectory(options);
  const validated = validateMarketHistoryCacheWrite({ key, rows, expiresAt, maxRows: MAX_CACHE_ROWS });
  if (!cacheDir || !validated.ok) return false;
  ({ key, rows, expiresAt } = validated.data);
  const filePath = cacheFilePath(cacheDir, key);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const payload: MarketHistoryCacheFile = { version: CACHE_VERSION, key, expiresAt, rows: [...rows] };
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
    await pruneMarketHistoryCache(cacheDir).catch(() => undefined);
    return true;
  } catch {
    await unlink(temporaryPath).catch(() => undefined);
    return false;
  }
}

function resolvedCacheDirectory(options: CacheOptions) {
  return Object.prototype.hasOwnProperty.call(options, "cacheDir")
    ? options.cacheDir ?? null
    : marketHistoryCacheDirectory();
}

function cacheFilePath(cacheDir: string, key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return path.join(cacheDir, `${digest}.json`);
}

function validCacheFile(value: unknown, key: string): value is MarketHistoryCacheFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<MarketHistoryCacheFile>;
  return record.version === CACHE_VERSION
    && record.key === key
    && typeof record.expiresAt === "number"
    && Number.isFinite(record.expiresAt)
    && Array.isArray(record.rows)
    && record.rows.length <= MAX_CACHE_ROWS
    && record.rows.every((row) => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

async function pruneMarketHistoryCache(cacheDir: string) {
  const entries = (await readdir(cacheDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  if (entries.length <= MAX_CACHE_FILES) return;
  const files = await Promise.all(entries.map(async (entry) => ({
    path: path.join(cacheDir, entry.name),
    modifiedAt: (await stat(path.join(cacheDir, entry.name))).mtimeMs,
  })));
  const excess = files.sort((left, right) => left.modifiedAt - right.modifiedAt)
    .slice(0, files.length - MAX_CACHE_FILES);
  await Promise.all(excess.map((file) => unlink(file.path).catch(() => undefined)));
}
