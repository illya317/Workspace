import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { prisma } from "@workspace/platform/server/prisma";

import { buildLibraryJobIdempotencyKey } from "./pipeline-contracts";
import { computeChecksumOrThrow } from "./checksum";
import { getDefaultRoot, safeResolve } from "./config";
import { buildProcessLibraryVersionCommand } from "./domain/processing-validation";
import { resolveLibraryVersionProcessingInput } from "./version-content";

const execFileAsync = promisify(execFile);

type WorkerResult = {
  status: "succeeded" | "warning";
  engine: string;
  ocrUsed: boolean;
  pageCount: number;
  segmentCount: number;
  artifacts: Array<{
    kind: "markdown" | "layout-json";
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    checksumSha256: string;
  }>;
  warnings: string[];
};

type LayoutSegment = {
  ordinal: number;
  kind: string;
  text: string;
  locator: Record<string, unknown>;
};

function workerPython() {
  const configured = process.env.LIBRARY_WORKER_PYTHON?.trim();
  if (configured) return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return path.join(os.homedir(), ".cache/workspace-library/venv/bin/python");
}

function workerScript() {
  return path.resolve(process.cwd(), "ops/library-process-document.py");
}

async function readWorkerResult(outputDir: string): Promise<WorkerResult> {
  return JSON.parse(await readFile(path.join(outputDir, "result.json"), "utf8")) as WorkerResult;
}

async function validateArtifacts(outputDir: string, result: WorkerResult) {
  for (const artifact of result.artifacts) {
    const absolutePath = path.join(outputDir, artifact.fileName);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile() || fileStat.size !== artifact.fileSizeBytes) throw new Error(`Artifact size mismatch: ${artifact.fileName}`);
    if (await computeChecksumOrThrow(absolutePath) !== artifact.checksumSha256) {
      throw new Error(`Artifact checksum mismatch: ${artifact.fileName}`);
    }
  }
}

async function readLayoutSegments(outputDir: string, result: WorkerResult): Promise<LayoutSegment[]> {
  const artifact = result.artifacts.find((item) => item.kind === "layout-json");
  if (!artifact) return [];
  const layout = JSON.parse(await readFile(path.join(outputDir, artifact.fileName), "utf8")) as { segments?: unknown[] };
  if (!Array.isArray(layout.segments)) return [];
  return layout.segments.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const segment = raw as Record<string, unknown>;
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    const locator = segment.locator && typeof segment.locator === "object" && !Array.isArray(segment.locator)
      ? segment.locator as Record<string, unknown>
      : null;
    if (!text || !locator) return [];
    return [{
      ordinal: Number.isInteger(segment.ordinal) ? Number(segment.ordinal) : index,
      kind: typeof segment.kind === "string" ? segment.kind : "text",
      text,
      locator,
    }];
  }).sort((left, right) => left.ordinal - right.ordinal);
}

export async function processLibraryVersion(input: { versionUid: string; pipelineVersion?: string }) {
  const validated = buildProcessLibraryVersionCommand(input);
  if (!validated.ok) throw new Error(validated.issue.message);
  const command = validated.data;
  const resolved = await resolveLibraryVersionProcessingInput(command.versionUid);
  const { version } = resolved;
  if (version.document.status === "archived") throw new Error("Archived Library documents are not processed");
  const runtimeRoot = getDefaultRoot();
  const inputPath = resolved.input.absolutePath;
  const inputChecksum = resolved.input.checksumSha256;

  const idempotencyKey = buildLibraryJobIdempotencyKey({
    versionUid: version.versionUid,
    inputChecksum,
    kind: "extract",
    pipelineVersion: command.pipelineVersion,
  });
  let job = await prisma.libraryProcessingJob.findUnique({ where: { idempotencyKey } });
  if (job?.status === "succeeded" || job?.status === "warning") {
    return { jobUid: job.jobUid, status: job.status, reused: true };
  }
  job = job
    ? await prisma.libraryProcessingJob.update({
      where: { id: job.id },
      data: { status: "running", attempt: { increment: 1 }, startedAt: new Date(), errorCode: null, errorMessage: null },
    })
    : await prisma.libraryProcessingJob.create({
      data: {
        versionId: version.id,
        kind: "extract",
        status: "running",
        attempt: 1,
        idempotencyKey,
        inputChecksum,
        pipelineVersion: command.pipelineVersion,
        providerKey: null,
        modelKey: null,
        startedAt: new Date(),
      },
    });

  const relativeOutputDir = path.posix.join(
    "artifacts",
    version.document.documentUid,
    version.versionUid,
    command.pipelineVersion,
    job.jobUid,
  );
  const outputDir = safeResolve(relativeOutputDir, runtimeRoot);
  if (!outputDir) throw new Error("Artifact output path is outside runtime root");

  try {
    let result: WorkerResult;
    try {
      result = await readWorkerResult(outputDir);
    } catch {
      await execFileAsync(workerPython(), [
        workerScript(),
        "--input", inputPath,
        "--output-dir", outputDir,
        "--document-uid", version.document.documentUid,
        "--version-uid", version.versionUid,
        "--input-checksum", inputChecksum,
        "--pipeline-version", command.pipelineVersion,
      ], { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
      result = await readWorkerResult(outputDir);
    }
    await validateArtifacts(outputDir, result);
    const segments = await readLayoutSegments(outputDir, result);
    await prisma.$transaction(async (tx) => {
      let layoutArtifactId: number | null = null;
      for (const artifact of result.artifacts) {
        const storedArtifact = await tx.libraryArtifact.upsert({
          where: {
            versionId_kind_checksumSha256: {
              versionId: version.id,
              kind: artifact.kind,
              checksumSha256: artifact.checksumSha256,
            },
          },
          create: {
            versionId: version.id,
            jobId: job.id,
            kind: artifact.kind,
            storagePath: path.posix.join(relativeOutputDir, artifact.fileName),
            mimeType: artifact.mimeType,
            fileSizeBytes: artifact.fileSizeBytes,
            checksumSha256: artifact.checksumSha256,
            pageCount: result.pageCount,
            toolchainJson: JSON.stringify({ engine: result.engine, ocrUsed: result.ocrUsed }),
          },
          update: { status: "ready" },
        });
        if (artifact.kind === "layout-json") layoutArtifactId = storedArtifact.id;
      }
      for (const [ordinal, segment] of segments.entries()) {
        await tx.libraryContentChunk.upsert({
          where: { versionId_ordinal: { versionId: version.id, ordinal } },
          create: {
            versionId: version.id,
            artifactId: layoutArtifactId,
            ordinal,
            content: segment.text,
            contentSha256: createHash("sha256").update(segment.text).digest("hex"),
            locatorJson: JSON.stringify(segment.locator),
            headingPathJson: JSON.stringify({ source: "layout", kind: segment.kind }),
            language: "zh",
          },
          update: {
            artifactId: layoutArtifactId,
            content: segment.text,
            contentSha256: createHash("sha256").update(segment.text).digest("hex"),
            locatorJson: JSON.stringify(segment.locator),
            headingPathJson: JSON.stringify({ source: "layout", kind: segment.kind }),
            language: "zh",
          },
        });
      }
      await tx.libraryContentChunk.deleteMany({
        where: { versionId: version.id, ordinal: { gte: segments.length } },
      });
      await tx.libraryProcessingJob.update({
        where: { id: job.id },
        data: {
          status: result.status,
          metricsJson: JSON.stringify({
            engine: result.engine,
            ocrUsed: result.ocrUsed,
            pageCount: result.pageCount,
            segmentCount: result.segmentCount,
            warnings: result.warnings,
          }),
          finishedAt: new Date(),
        },
      });
    });
    return { jobUid: job.jobUid, reused: false, ...result };
  } catch (error) {
    await prisma.libraryProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorCode: "parse_failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
