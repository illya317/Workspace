import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { ReadableBatchSpec, ReadableSourcePackageEvidence } from "./types";

interface ManifestEntry {
  database: string;
  table: string;
  status: string;
  rows: number;
  data: string;
}

interface SourceMap {
  snapshotDate?: string;
  previousSnapshot?: string | null;
  cutoff?: { date?: string; isAccountingClose?: boolean };
  t6?: {
    includedAccountSets?: Array<{ id?: string; name?: string; years?: number[] }>;
    excludedAccountSets?: Array<{ id?: string; reason?: string }>;
  };
  tPlus?: {
    accountSets?: Array<{ database?: string; name?: string; recommendedImportYears?: number[] }>;
  };
}

const evidenceCache = new Map<string, Promise<ReadableSourcePackageEvidence>>();

async function sha256File(path: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function parseJsonLines<T>(value: string): T[] {
  return value.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
}

function checksumMap(value: string) {
  return new Map(value.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    return match ? [[match[2], match[1].toLowerCase()] as const] : [];
  }));
}

function assertSpecInSourceMap(sourceMap: SourceMap, spec: ReadableBatchSpec) {
  if (spec.sourceSystem === "T6") {
    const excluded = sourceMap.t6?.excludedAccountSets?.find((item) => item.id === spec.sourceLedger);
    if (excluded) throw new Error(`账套 ${spec.sourceLedger} 已被来源包排除：${excluded.reason ?? "未说明原因"}`);
    const accountSet = sourceMap.t6?.includedAccountSets?.find((item) => item.id === spec.sourceLedger);
    const [firstYear, lastYear] = accountSet?.years ?? [];
    if (!accountSet || !firstYear || !lastYear || spec.year < firstYear || spec.year > lastYear) {
      throw new Error(`来源包未声明 T6 账套 ${spec.sourceLedger}/${spec.year}`);
    }
    if (spec.mappingMode !== "recurring") throw new Error("T6 来源必须使用 recurring 映射模式");
    return;
  }
  const accountSet = sourceMap.tPlus?.accountSets?.find((item) => item.database === spec.sourceDatabase);
  if (!accountSet?.recommendedImportYears?.includes(spec.year)) {
    throw new Error(`来源包未建议导入 TPlus 账套 ${spec.sourceDatabase}/${spec.year}`);
  }
  if (spec.mappingMode !== "historical") throw new Error("TPlus 只允许 historical 一次性历史映射");
}

export async function loadReadableArchiveEvidence(input: {
  root: string;
  spec: ReadableBatchSpec;
  requiredTables: Array<{ database: string; table: string }>;
}): Promise<ReadableSourcePackageEvidence> {
  const cacheKey = [input.root, input.spec.sourceSystem, input.spec.sourceDatabase, input.spec.year].join("|");
  const cached = evidenceCache.get(cacheKey);
  if (cached) return cached;
  const loading = (async () => {
    const sourceMapPath = join(input.root, "source-map.json");
    const sourceMapText = await readFile(sourceMapPath, "utf8");
    const sourceMap = JSON.parse(sourceMapText) as SourceMap;
    assertSpecInSourceMap(sourceMap, input.spec);
    if (!sourceMap.snapshotDate || !sourceMap.cutoff?.date || sourceMap.cutoff.isAccountingClose === undefined) {
      throw new Error("source-map.json 缺少 snapshotDate 或 cutoff 关账声明");
    }

    const engineDir = join(input.root, input.spec.sourceSystem === "T6" ? "T6" : "TPlus");
    const manifestPath = join(engineDir, "manifest.jsonl");
    const checksumsPath = join(engineDir, "SHA256SUMS.txt");
    const validationPath = join(engineDir, "validation-summary.json");
    const [manifestText, checksumsText, validationText] = await Promise.all([
      readFile(manifestPath, "utf8"), readFile(checksumsPath, "utf8"), readFile(validationPath, "utf8"),
    ]);
    const manifest = parseJsonLines<ManifestEntry>(manifestText);
    const hashes = checksumMap(checksumsText);
    const validation = JSON.parse(validationText) as {
      manifestEntries?: number;
      missingTables?: number;
      errorTables?: number;
      errors?: unknown[];
    };
    if (validation.missingTables !== 0 || validation.errorTables !== 0 || (validation.errors?.length ?? 0) > 0) {
      throw new Error(`${input.spec.sourceSystem} 来源包校验摘要包含缺失或错误表`);
    }
    if (validation.manifestEntries !== manifest.length) throw new Error("manifest 行数与 validation-summary 不一致");

    const requiredEntries = input.requiredTables.map(({ database, table }) => {
      const entry = manifest.find((item) => item.database === database && item.table === table);
      if (!entry || entry.status !== "ok") throw new Error(`来源包缺少已校验表 ${database}.${table}`);
      return entry;
    });
    await Promise.all(requiredEntries.map(async (entry) => {
      const expected = hashes.get(entry.data);
      if (!expected) throw new Error(`SHA256SUMS 未登记 ${entry.data}`);
      const actual = await sha256File(join(engineDir, entry.data));
      if (actual !== expected) throw new Error(`来源文件校验失败：${entry.data}`);
    }));

    const sourceMapChecksum = createHash("sha256").update(sourceMapText).digest("hex");
    const manifestChecksum = createHash("sha256").update(manifestText).digest("hex");
    const validationChecksum = createHash("sha256").update(validationText).digest("hex");
    const selectedDatabaseChecksum = createHash("sha256")
      .update(requiredEntries.map((entry) => `${entry.data}:${hashes.get(entry.data)}`).sort().join("\n"))
      .digest("hex");
    const packageKey = createHash("sha256").update([
      sourceMapChecksum, manifestChecksum, validationChecksum, selectedDatabaseChecksum,
    ].join(":"))
      .digest("hex");
    return {
      packageKey,
      archiveRevision: basename(input.root),
      sourcePath: input.root,
      snapshotDate: sourceMap.snapshotDate,
      cutoffDate: sourceMap.cutoff.date,
      isAccountingClose: sourceMap.cutoff.isAccountingClose,
      previousSnapshot: sourceMap.previousSnapshot ?? undefined,
      sourceMapChecksum,
      manifestChecksum,
      validationChecksum,
      selectedDatabaseChecksum,
      validationStatus: "verified" as const,
      manifestEntryCount: manifest.length,
      validatedTableCount: requiredEntries.length,
    };
  })();
  evidenceCache.set(cacheKey, loading);
  try {
    return await loading;
  } catch (error) {
    evidenceCache.delete(cacheKey);
    throw error;
  }
}
