import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { prisma } from "@workspace/platform/server/prisma";
import { buildLibraryVectorIndexCommand } from "./domain/processing-validation";

const execFileAsync = promisify(execFile);
const DEFAULT_MODEL = "Qwen/Qwen3-Embedding-0.6B";
const DEFAULT_DIMENSIONS = 1024;
const MAX_CHUNK_CHARS = 6000;

type EmbeddingOutput = { dimensions: number; embeddings: number[][] };

function workerPython() {
  const configured = process.env.LIBRARY_WORKER_PYTHON?.trim();
  if (configured) return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return path.join(os.homedir(), ".cache/workspace-library/venv/bin/python");
}

function modelDirectory() {
  const configured = process.env.LIBRARY_EMBEDDING_MODEL_DIR?.trim();
  if (configured) return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return path.join(os.homedir(), ".cache/workspace-library/models/Qwen3-Embedding-0.6B");
}

function modelKey() {
  return `${process.env.LIBRARY_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL}@${process.env.LIBRARY_EMBEDDING_MODEL_REVISION?.trim() || "master"}`;
}

async function embed(texts: string[], mode: "query" | "document") {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "workspace-library-embedding-"));
  const inputPath = path.join(temporary, "input.json");
  const outputPath = path.join(temporary, "output.json");
  try {
    await writeFile(inputPath, JSON.stringify({ texts }), "utf8");
    await execFileAsync(workerPython(), [
      path.resolve(process.cwd(), "ops/library-embed-text.py"),
      "--model-dir", modelDirectory(),
      "--input-json", inputPath,
      "--output-json", outputPath,
      "--mode", mode,
    ], { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    const output = JSON.parse(await readFile(outputPath, "utf8")) as EmbeddingOutput;
    if (output.dimensions !== DEFAULT_DIMENSIONS || output.embeddings.length !== texts.length) {
      throw new Error("向量模型返回的维度或数量不符合锁定配置");
    }
    if (output.embeddings.some((vector) => vector.length !== output.dimensions)) {
      throw new Error("向量模型返回了不一致的向量维度");
    }
    return output;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function buildLibraryVectorIndex(versionUid: string) {
  const command = buildLibraryVectorIndexCommand({ versionUid });
  if (!command.ok) throw new Error(command.issue.message);
  versionUid = command.data.versionUid;
  const version = await prisma.libraryDocumentVersion.findUnique({
    where: { versionUid },
    include: { chunks: { orderBy: { ordinal: "asc" } }, searchIndexes: true },
  });
  if (!version) throw new Error("资料版本不存在");
  if (version.chunks.length === 0) return { status: "unavailable" as const, modelKey: modelKey(), reason: "资料尚未生成可索引文本" };
  const generation = Math.max(0, ...version.searchIndexes.filter((item) => item.kind === "vector").map((item) => item.generation)) + 1;
  const index = await prisma.librarySearchIndex.create({
    data: {
      versionId: version.id,
      kind: "vector",
      engineKey: "sentence-transformers",
      modelKey: modelKey(),
      embeddingDimensions: DEFAULT_DIMENSIONS,
      generation,
      status: "building",
    },
  });
  try {
    const output = await embed(version.chunks.map((chunk) => chunk.content.slice(0, MAX_CHUNK_CHARS)), "document");
    const checksum = createHash("sha256");
    checksum.update(modelKey());
    version.chunks.forEach((chunk) => checksum.update(chunk.contentSha256));
    await prisma.$transaction(async (tx) => {
      await tx.libraryContentEmbedding.createMany({
        data: version.chunks.map((chunk, offset) => ({
          indexId: index.id,
          chunkId: chunk.id,
          modelKey: modelKey(),
          dimensions: output.dimensions,
          values: output.embeddings[offset]!,
        })),
      });
      await tx.librarySearchIndex.updateMany({
        where: { versionId: version.id, kind: "vector", id: { not: index.id } },
        data: { active: false, status: "retired" },
      });
      await tx.librarySearchIndex.update({
        where: { id: index.id },
        data: { active: true, status: "ready", indexChecksum: checksum.digest("hex"), builtAt: new Date() },
      });
    });
    return { status: "ready" as const, modelKey: modelKey(), dimensions: output.dimensions };
  } catch (error) {
    await prisma.librarySearchIndex.update({ where: { id: index.id }, data: { status: "failed", active: false } });
    return { status: "failed" as const, modelKey: modelKey(), reason: error instanceof Error ? error.message : String(error) };
  }
}

function dot(left: number[], right: number[]) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index]! * right[index]!;
  return value;
}

function locator(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function semanticSearchLibraryDocuments(input: { documentUids: string[]; query: string; limit: number }) {
  const rows = await prisma.libraryContentEmbedding.findMany({
    where: {
      index: {
        kind: "vector", active: true, status: "ready",
        version: { document: { documentUid: { in: input.documentUids }, status: "active" } },
      },
    },
    include: {
      chunk: true,
      index: { include: { version: { include: { document: true } } } },
    },
  });
  if (rows.length === 0) return { mode: "unavailable" as const, modelKey: null, message: "所选资料尚未建立向量索引", results: [] };
  const activeModelKey = rows[0]!.modelKey;
  if (activeModelKey !== modelKey()) {
    return { mode: "unavailable" as const, modelKey: activeModelKey, message: "向量索引模型与当前运行时不一致，请重新建立索引", results: [] };
  }
  const sameModelRows = rows.filter((row) => row.modelKey === activeModelKey && row.dimensions === DEFAULT_DIMENSIONS);
  let queryVector: number[];
  try {
    queryVector = (await embed([input.query], "query")).embeddings[0]!;
  } catch (error) {
    return { mode: "unavailable" as const, modelKey: activeModelKey, message: error instanceof Error ? error.message : "向量模型不可用", results: [] };
  }
  const results = sameModelRows.map((row) => ({
    documentUid: row.index.version.document.documentUid,
    versionUid: row.index.version.versionUid,
    chunkUid: row.chunk.chunkUid,
    title: row.index.version.document.title || row.index.version.document.fileName,
    score: dot(queryVector, row.values),
    quote: row.chunk.content.slice(0, 720),
    locator: locator(row.chunk.locatorJson),
  })).sort((left, right) => right.score - left.score).slice(0, input.limit);
  return { mode: "vector" as const, modelKey: activeModelKey, message: null, results };
}
