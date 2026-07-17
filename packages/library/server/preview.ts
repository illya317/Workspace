import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { prisma } from "@workspace/platform/server/prisma";

import { LIBRARY_PREVIEW_VERSION } from "../constants/pipeline";
import { computeChecksumOrThrow } from "./checksum";
import { getDefaultRoot, safeResolve } from "./config";
import { buildProcessLibraryVersionCommand } from "./domain/processing-validation";
import { buildLibraryJobIdempotencyKey } from "./pipeline-contracts";
import { resolveLibraryVersionProcessingInput } from "./version-content";

const execFileAsync = promisify(execFile);

type PreviewResult = {
  status: "succeeded";
  pageCount: number;
  compressionRetained: boolean;
  compressionSavingsRatio: number;
  visualRms: number;
  textLayerMatches: boolean | null;
  artifacts: Array<{
    kind: "preview-pdf" | "thumbnail";
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    checksumSha256: string;
    pageCount: number | null;
  }>;
  warnings: string[];
};

const PREVIEWABLE_EXTENSIONS = new Set(["pdf"]);

export function supportsLibraryPreview(extension: string | null | undefined) {
  return PREVIEWABLE_EXTENSIONS.has(extension?.toLowerCase() || "");
}

function pythonPath() {
  const configured = process.env.LIBRARY_WORKER_PYTHON?.trim();
  if (configured) return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return path.join(os.homedir(), ".cache/workspace-library/venv/bin/python");
}

async function readResult(outputDir: string) {
  return JSON.parse(await readFile(path.join(outputDir, "result.json"), "utf8")) as PreviewResult;
}

async function validateResult(outputDir: string, result: PreviewResult) {
  for (const artifact of result.artifacts) {
    const artifactPath = path.join(outputDir, artifact.fileName);
    const fileStat = await stat(artifactPath);
    if (!fileStat.isFile() || fileStat.size !== artifact.fileSizeBytes) throw new Error(`Preview artifact size mismatch: ${artifact.fileName}`);
    if (await computeChecksumOrThrow(artifactPath) !== artifact.checksumSha256) {
      throw new Error(`Preview artifact checksum mismatch: ${artifact.fileName}`);
    }
  }
}

export async function previewLibraryVersion(input: { versionUid: string; previewVersion?: string }) {
  const validated = buildProcessLibraryVersionCommand({
    versionUid: input.versionUid,
    pipelineVersion: input.previewVersion || LIBRARY_PREVIEW_VERSION,
  });
  if (!validated.ok) throw new Error(validated.issue.message);
  const version = await prisma.libraryDocumentVersion.findUnique({
    where: { versionUid: validated.data.versionUid },
    include: { document: { select: { documentUid: true, status: true } } },
  });
  if (!version?.checksumSha256) throw new Error("Library version and checksum are required");
  if (version.document.status === "archived") throw new Error("Archived Library documents are not previewed");
  if (!supportsLibraryPreview(version.extension)) throw new Error(`preview unsupported for extension: ${version.extension || "(none)"}`);

  const sourceIdempotencyKey = buildLibraryJobIdempotencyKey({
    versionUid: version.versionUid,
    inputChecksum: version.checksumSha256,
    kind: "preview",
    pipelineVersion: validated.data.pipelineVersion,
  });
  let job = await prisma.libraryProcessingJob.findUnique({ where: { idempotencyKey: sourceIdempotencyKey } });
  if (job?.status === "succeeded" || job?.status === "warning") {
    return { jobUid: job.jobUid, status: job.status, reused: true };
  }
  const resolved = await resolveLibraryVersionProcessingInput(version.versionUid);
  const inputPath = resolved.input.absolutePath;
  const inputChecksum = resolved.input.checksumSha256;
  const runtimeRoot = getDefaultRoot();
  const idempotencyKey = buildLibraryJobIdempotencyKey({
    versionUid: version.versionUid,
    inputChecksum,
    kind: "preview",
    pipelineVersion: validated.data.pipelineVersion,
  });
  if (idempotencyKey !== sourceIdempotencyKey) {
    job = await prisma.libraryProcessingJob.findUnique({ where: { idempotencyKey } });
    if (job?.status === "succeeded" || job?.status === "warning") {
      return { jobUid: job.jobUid, status: job.status, reused: true };
    }
  }
  job = job
    ? await prisma.libraryProcessingJob.update({
      where: { id: job.id },
      data: { status: "running", attempt: { increment: 1 }, startedAt: new Date(), errorCode: null, errorMessage: null },
    })
    : await prisma.libraryProcessingJob.create({
      data: {
        versionId: version.id,
        kind: "preview",
        status: "running",
        attempt: 1,
        idempotencyKey,
        inputChecksum,
        pipelineVersion: validated.data.pipelineVersion,
        startedAt: new Date(),
      },
    });
  const relativeOutputDir = path.posix.join(
    "artifacts",
    version.document.documentUid,
    version.versionUid,
    `preview-${validated.data.pipelineVersion}`,
    job.jobUid,
  );
  const outputDir = safeResolve(relativeOutputDir, runtimeRoot);
  if (!outputDir) throw new Error("Preview output path is outside runtime root");

  try {
    let result: PreviewResult;
    try {
      result = await readResult(outputDir);
    } catch {
      const workerArgs = [
        path.resolve(process.cwd(), "ops/library-preview-document.py"),
        "--input", inputPath,
        "--output-dir", outputDir,
        "--input-checksum", inputChecksum,
        "--preview-version", validated.data.pipelineVersion,
      ];
      if (validated.data.pipelineVersion.endsWith("-fast")) workerArgs.push("--skip-compression");
      await execFileAsync(pythonPath(), workerArgs, { timeout: 20 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
      result = await readResult(outputDir);
    }
    await validateResult(outputDir, result);
    await prisma.$transaction(async (tx) => {
      for (const artifact of result.artifacts) {
        await tx.libraryArtifact.upsert({
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
            pageCount: artifact.pageCount,
            toolchainJson: JSON.stringify({
              previewVersion: validated.data.pipelineVersion,
              compressionRetained: result.compressionRetained,
              savingsRatio: result.compressionSavingsRatio,
              visualRms: result.visualRms,
              textLayerMatches: result.textLayerMatches,
            }),
          },
          update: { status: "ready" },
        });
      }
      await tx.libraryProcessingJob.update({
        where: { id: job.id },
        data: { status: "succeeded", metricsJson: JSON.stringify(result), finishedAt: new Date() },
      });
    });
    return { jobUid: job.jobUid, reused: false, ...result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.libraryProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorCode: errorMessage.includes("preview unsupported for extension") ? "unsupported_type" : "artifact_invalid",
        errorMessage: errorMessage.slice(0, 2000),
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
