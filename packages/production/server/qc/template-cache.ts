import "server-only";
import crypto from "crypto";
import path from "path";
import { mkdir, readdir, readFile, rename, writeFile } from "fs/promises";
import { getQcConfigOverview } from "./overview";
import { getQcTemplateDetailFromConfig } from "./record-structure";
import { resolvePharmaOpsRoot } from "./source";
import type { QcConfigOverview, QcTemplateDetail } from "./types";

interface QcTemplateCacheFile {
  schemaVersion: 1;
  builtAt: string;
  contentHash: string;
  overview: QcConfigOverview;
  templates: Record<string, QcTemplateDetail>;
}

let buildPromise: Promise<QcTemplateCacheFile> | null = null;
let memoryCache: QcTemplateCacheFile | null = null;
let memoryCacheValidatedAt = 0;

function cacheValidationIntervalMs() {
  const configured = Number(process.env.QC_TEMPLATE_CACHE_VALIDATE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 30_000;
}

function rememberCache(cache: QcTemplateCacheFile) {
  memoryCache = cache;
  memoryCacheValidatedAt = Date.now();
  return cache;
}

function workspaceCachePath() {
  const workspaceDir = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!workspaceDir || !path.isAbsolute(workspaceDir)) {
    throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for QC template cache");
  }
  return path.join(workspaceDir, "cache", "production", "qc", "template-cache.json");
}

async function listConfigFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listConfigFiles(fullPath);
    return entry.isFile() && /\.(json|ya?ml)$/i.test(entry.name) ? [fullPath] : [];
  }));
  return nested.flat().sort();
}

async function configContentHash(configRoot: string) {
  const hash = crypto.createHash("sha256");
  for (const filePath of await listConfigFiles(configRoot)) {
    hash.update(path.relative(configRoot, filePath));
    hash.update("\0");
    hash.update(await readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function stripLayoutBlocks(detail: QcTemplateDetail): QcTemplateDetail {
  return {
    ...detail,
    stages: detail.stages.map((stage) => ({
      ...stage,
      precheckLayoutBlocks: undefined,
      experimentLayoutBlocks: undefined,
      tests: stage.tests.map((test) => ({ ...test, layoutBlocks: undefined, methodGroups: [] })),
    })),
  };
}

async function readCache(): Promise<QcTemplateCacheFile | null> {
  try {
    return JSON.parse(await readFile(workspaceCachePath(), "utf8")) as QcTemplateCacheFile;
  } catch {
    return null;
  }
}

async function writeCache(cache: QcTemplateCacheFile) {
  const filePath = workspaceCachePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(cache)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

async function buildCacheWithHash(contentHash: string): Promise<QcTemplateCacheFile> {
  const overview = await getQcConfigOverview();
  const pairs = await Promise.all(
    overview.recordTemplates.map(async (template) => [template.id, await getQcTemplateDetailFromConfig(template.id)] as const),
  );
  const cache: QcTemplateCacheFile = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    contentHash,
    overview,
    templates: Object.fromEntries(pairs),
  };
  await writeCache(cache);
  return cache;
}

async function currentContentHash() {
  const source = await resolvePharmaOpsRoot();
  if (!source.available) return "";
  return configContentHash(source.configRoot);
}

async function ensureTemplateCache(): Promise<QcTemplateCacheFile> {
  if (memoryCache && Date.now() - memoryCacheValidatedAt < cacheValidationIntervalMs()) return memoryCache;
  const [cache, contentHash] = await Promise.all([readCache(), currentContentHash()]);
  if (cache?.contentHash === contentHash) return rememberCache(cache);
  if (cache && !buildPromise) buildPromise = buildCacheWithHash(contentHash).finally(() => { buildPromise = null; });
  if (cache) return rememberCache(cache);
  buildPromise ||= buildCacheWithHash(contentHash).finally(() => { buildPromise = null; });
  return rememberCache(await buildPromise);
}

export async function buildQcTemplateCache() {
  return rememberCache(await buildCacheWithHash(await currentContentHash()));
}

export async function getQcConfigOverviewCached() {
  return (await ensureTemplateCache()).overview;
}

export async function getQcTemplateSummaries() {
  const cache = await ensureTemplateCache();
  return cache.overview.recordTemplates.flatMap((template) => {
    const detail = cache.templates[template.id];
    return detail ? [stripLayoutBlocks(detail)] : [];
  });
}

export async function getQcTemplateDetail(templateId: string) {
  const detail = (await ensureTemplateCache()).templates[templateId];
  if (detail) return detail;
  return getQcTemplateDetailFromConfig(templateId);
}
