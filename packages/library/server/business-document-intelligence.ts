import type {
  BusinessDocumentIntelligenceRequest,
  BusinessDocumentIntelligenceResponse,
  BusinessDocumentProcessingState,
  BusinessDocumentStatus,
} from "@workspace/platform/server/business-document-intelligence-contract";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";

import { ensureLibraryDirectory } from "./directories";
import { buildLibraryVectorIndex, semanticSearchLibraryDocuments } from "./embeddings";
import { uploadLibraryDocument } from "./uploads";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function safeSegment(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "未命名企业";
}

function jobState(status: string | null | undefined): BusinessDocumentProcessingState {
  if (!status || status === "queued") return "pending";
  if (status === "running") return "running";
  if (status === "succeeded") return "ready";
  if (status === "warning") return "warning";
  if (status === "failed" || status === "cancelled") return "failed";
  return "unavailable";
}

function parseMetrics(value: string | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

async function listStatuses(documentUids: string[]): Promise<BusinessDocumentStatus[]> {
  if (documentUids.length === 0) return [];
  const documents = await prisma.libraryDocument.findMany({
    where: { documentUid: { in: documentUids } },
    include: {
      currentVersion: {
        include: {
          processingJobs: { orderBy: { createdAt: "desc" }, take: 20 },
          artifacts: { where: { status: "ready" }, orderBy: { createdAt: "desc" } },
          searchIndexes: { where: { kind: "vector" }, orderBy: { generation: "desc" }, take: 1 },
        },
      },
    },
  });
  return documents.map((document) => {
    const extract = document.currentVersion?.processingJobs.find((job) => job.kind === "extract");
    const metrics = parseMetrics(extract?.metricsJson);
    const ocrUsed = metrics.ocrUsed === true;
    const vector = document.currentVersion?.searchIndexes[0];
    const layoutArtifact = document.currentVersion?.artifacts.find((artifact) => artifact.kind === "layout-json");
    return {
      documentId: document.id,
      documentUid: document.documentUid,
      versionUid: document.currentVersion?.versionUid ?? null,
      title: document.title || document.fileName,
      fileName: document.fileName,
      reviewStatus: document.reviewStatus,
      extractionStatus: jobState(extract?.status),
      ocrStatus: extract && ["succeeded", "warning"].includes(extract.status)
        ? ocrUsed ? jobState(extract.status) : "not_needed"
        : jobState(extract?.status),
      vectorStatus: vector ? jobState(vector.status) : "pending",
      ocrUsed,
      modelKey: vector?.modelKey ?? null,
      pageCount: layoutArtifact?.pageCount ?? null,
      updatedAt: document.updatedAt.toISOString(),
    };
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function requireAction(request: BusinessDocumentIntelligenceRequest, action: "read" | "import") {
  if (await evaluatePermissionAction(request.requesterId, request.resourceKey, action)) return;
  throw new Error(action === "import" ? "没有投资企业资料导入权限" : "没有投资企业资料查看权限");
}

async function upload(request: Extract<BusinessDocumentIntelligenceRequest, { operation: "upload" }>) {
  await requireAction(request, "import");
  const buffer = Buffer.from(request.file.contentBase64, "base64");
  if (buffer.length <= 0 || buffer.length > MAX_FILE_BYTES) throw new Error("文件必须大于 0 且不超过 20 MB");
  const directoryPath = `投资企业/${safeSegment(request.companyCode)}`;
  await ensureLibraryDirectory("default", directoryPath);
  const file = new File([new Uint8Array(buffer)], request.file.fileName, { type: request.file.mimeType || "application/octet-stream" });
  const uploaded = await uploadLibraryDocument({
    userId: request.requesterId,
    file,
    fileName: request.file.fileName,
    directoryPath,
    title: request.title,
    summary: request.notes || `${request.documentCategory}｜投资企业 ${request.companyCode}`,
    tags: [],
    confidentialityLevel: 3,
  });
  if (uploaded.pipeline.markdown.status === "succeeded") await buildLibraryVectorIndex(uploaded.versionUid);
  const document = (await listStatuses([uploaded.documentUid]))[0];
  if (!document) throw new Error("资料已上传但状态读取失败");
  return { operation: "upload" as const, document };
}

export async function handleBusinessDocumentIntelligence(
  request: BusinessDocumentIntelligenceRequest,
): Promise<BusinessDocumentIntelligenceResponse> {
  if (request.operation === "upload") return upload(request);
  await requireAction(request, "read");
  if (request.operation === "status") {
    return { operation: "status", documents: await listStatuses(request.documentUids) };
  }
  const result = await semanticSearchLibraryDocuments({
    documentUids: request.documentUids,
    query: request.query,
    limit: request.limit,
  });
  return { operation: "search", ...result };
}
