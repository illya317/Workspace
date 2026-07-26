import path from "node:path";

import { prisma } from "@workspace/platform/server/prisma";
import { runValidatedPdfOptimization } from "@workspace/platform/server/pdf-optimization";

import { LIBRARY_PREVIEW_VERSION } from "../constants/pipeline";
import { getDefaultRoot, safeResolve } from "./config";
import { buildProcessLibraryVersionCommand } from "./domain/processing-validation";
import { buildLibraryJobIdempotencyKey } from "./pipeline-contracts";
import { resolveLibraryVersionProcessingInput } from "./version-content";

const PREVIEWABLE_EXTENSIONS = new Set(["pdf"]);

export function supportsLibraryPreview(extension: string | null | undefined) {
  return PREVIEWABLE_EXTENSIONS.has(extension?.toLowerCase() || "");
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
    const result = await runValidatedPdfOptimization({
      inputPath,
      outputDir,
      inputChecksum,
      pipelineVersion: validated.data.pipelineVersion,
      skipCompression: validated.data.pipelineVersion.endsWith("-fast"),
    });
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
