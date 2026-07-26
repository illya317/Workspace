import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PdfOptimizationArtifact = {
  kind: "preview-pdf" | "thumbnail";
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  pageCount: number | null;
};

export type PdfOptimizationResult = {
  status: "succeeded";
  pageCount: number;
  compressionRetained: boolean;
  compressionSavingsRatio: number;
  visualRms: number;
  textLayerMatches: boolean | null;
  artifacts: PdfOptimizationArtifact[];
  warnings: string[];
};

function workerPython() {
  const configured = process.env.LIBRARY_WORKER_PYTHON?.trim();
  if (configured) return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return path.join(os.homedir(), ".cache/workspace-library/venv/bin/python");
}

function workerScript() {
  return path.resolve(process.cwd(), "ops/library-preview-document.py");
}

async function checksum(filePath: string) {
  const digest = createHash("sha256");
  const input = createReadStream(filePath);
  for await (const chunk of input) digest.update(chunk);
  return digest.digest("hex");
}

function parsedResult(value: unknown): PdfOptimizationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PDF optimization result is invalid");
  const result = value as Partial<PdfOptimizationResult>;
  if (
    result.status !== "succeeded"
    || !Number.isInteger(result.pageCount)
    || typeof result.compressionRetained !== "boolean"
    || typeof result.compressionSavingsRatio !== "number"
    || typeof result.visualRms !== "number"
    || !Array.isArray(result.artifacts)
    || !Array.isArray(result.warnings)
  ) throw new Error("PDF optimization result is invalid");
  return result as PdfOptimizationResult;
}

async function readResult(outputDir: string) {
  return parsedResult(JSON.parse(await readFile(path.join(outputDir, "result.json"), "utf8")));
}

async function validateArtifacts(outputDir: string, result: PdfOptimizationResult) {
  const normalizedRoot = `${path.resolve(outputDir)}${path.sep}`;
  for (const artifact of result.artifacts) {
    if (path.basename(artifact.fileName) !== artifact.fileName) throw new Error("PDF optimization artifact name is invalid");
    const artifactPath = path.resolve(outputDir, artifact.fileName);
    if (!artifactPath.startsWith(normalizedRoot)) throw new Error("PDF optimization artifact escaped its output directory");
    const fileStat = await stat(artifactPath);
    if (!fileStat.isFile() || fileStat.size !== artifact.fileSizeBytes) {
      throw new Error(`PDF optimization artifact size mismatch: ${artifact.fileName}`);
    }
    if (await checksum(artifactPath) !== artifact.checksumSha256) {
      throw new Error(`PDF optimization artifact checksum mismatch: ${artifact.fileName}`);
    }
  }
}

export async function runValidatedPdfOptimization(input: {
  inputPath: string;
  outputDir: string;
  inputChecksum: string;
  pipelineVersion: string;
  skipCompression?: boolean;
  skipThumbnail?: boolean;
}) {
  let result: PdfOptimizationResult;
  try {
    result = await readResult(input.outputDir);
  } catch {
    const args = [
      workerScript(),
      "--input", input.inputPath,
      "--output-dir", input.outputDir,
      "--input-checksum", input.inputChecksum,
      "--preview-version", input.pipelineVersion,
    ];
    if (input.skipCompression) args.push("--skip-compression");
    if (input.skipThumbnail) args.push("--skip-thumbnail");
    await execFileAsync(workerPython(), args, { timeout: 20 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    result = await readResult(input.outputDir);
  }
  await validateArtifacts(input.outputDir, result);
  return result;
}
