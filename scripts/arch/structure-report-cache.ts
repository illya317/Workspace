import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const CACHE_SCHEMA_VERSION = 1;
const SNAPSHOT_KEY_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_CACHE_DIR = path.resolve(__dirname, "../../.cache/check-results/structure-reports");
const DEFAULT_PENDING_ROOT = path.resolve(__dirname, "../../.cache/check-results-pending");

type StructureReportCacheEnvelope<T> = {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  snapshotKey: string;
  report: T;
};

type CheckEnvironment = Readonly<Record<string, string | undefined>>;

type LoadOrCreateStructureReportOptions<T> = {
  createReport: () => T;
  validateReport: (value: unknown) => value is T;
  cacheDir?: string;
  env?: CheckEnvironment;
};

export function structureReportCacheFile(cacheDir: string, snapshotKey: string) {
  return path.join(cacheDir, `${snapshotKey}.json`);
}

function readCachedReport<T>(
  cacheFile: string,
  snapshotKey: string,
  validateReport: (value: unknown) => value is T,
): T | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Partial<StructureReportCacheEnvelope<unknown>>;
    if (
      parsed.schemaVersion !== CACHE_SCHEMA_VERSION
      || parsed.snapshotKey !== snapshotKey
      || !validateReport(parsed.report)
    ) {
      return null;
    }
    return parsed.report;
  } catch {
    return null;
  }
}

function writeCachedReport<T>(cacheFile: string, snapshotKey: string, report: T) {
  const cacheDir = path.dirname(cacheFile);
  const temporaryFile = path.join(cacheDir, `.${path.basename(cacheFile)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const envelope: StructureReportCacheEnvelope<T> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      snapshotKey,
      report,
    };
    fs.writeFileSync(temporaryFile, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryFile, cacheFile);
  } catch {
    // Cache writes are an optimization only. The freshly built report remains authoritative.
  } finally {
    fs.rmSync(temporaryFile, { force: true });
  }
}

function pendingStructureReportDirectory(cacheDir: string, env: CheckEnvironment) {
  if (path.resolve(cacheDir) !== DEFAULT_CACHE_DIR) return null;
  const value = env.CHECK_CACHE_PENDING_DIR?.trim();
  if (!value) return null;
  const resolved = path.resolve(value);
  const relative = path.relative(DEFAULT_PENDING_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return path.join(resolved, "structure-reports");
}

export function loadOrCreateStructureReport<T>({
  createReport,
  validateReport,
  cacheDir = DEFAULT_CACHE_DIR,
  env = process.env,
}: LoadOrCreateStructureReportOptions<T>): T {
  const snapshotKey = env.CHECK_WORKSPACE_SNAPSHOT_KEY?.trim() ?? "";
  if (env.CHECK_RESULT_CACHE === "0" || !SNAPSHOT_KEY_PATTERN.test(snapshotKey)) {
    return createReport();
  }

  const pendingDir = pendingStructureReportDirectory(cacheDir, env);
  const cacheFile = structureReportCacheFile(cacheDir, snapshotKey);
  const pendingFile = pendingDir ? structureReportCacheFile(pendingDir, snapshotKey) : null;
  const cached = (pendingFile ? readCachedReport(pendingFile, snapshotKey, validateReport) : null)
    ?? readCachedReport(cacheFile, snapshotKey, validateReport);
  if (cached) return cached;

  const report = createReport();
  writeCachedReport(pendingFile ?? cacheFile, snapshotKey, report);
  return report;
}
