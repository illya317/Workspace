import "server-only";

import {
  DIRECT_LIBRARY_FILE_LIMIT,
  selectLibraryDeliveryDocuments,
  shouldSendLibraryFilesDirectly,
  type LibraryDeliveryDocument,
} from "./agent-delivery-selection";
import { buildCreateLibraryExportCommand } from "./domain/export-validation";
import { createLibraryExport } from "./export";
import { getLibraryFileMetadataByVersionUid } from "./file-access";
import { checkLibraryExport } from "./permissions";
import { searchLibraryDocumentSet } from "./search";

export { DIRECT_LIBRARY_FILE_LIMIT };

export type LibraryAgentDeliveryArtifact = {
  source: "library-export" | "library-version";
  artifactId: string;
  fileName: string;
  fileSizeBytes: number;
  itemCount: number;
};

export type LibraryAgentDeliveryPlanDocument = LibraryDeliveryDocument & {
  index: number;
};

export type LibraryAgentDeliveryPlan =
  | { status: "denied" }
  | { status: "empty"; message: string }
  | {
      status: "ready";
      query: string;
      documents: LibraryAgentDeliveryPlanDocument[];
    };

export type LibraryAgentDeliveryRequest =
  | { status: "denied" }
  | { status: "empty"; message: string }
  | {
      status: "ready";
      mode: "files" | "bundle";
      query: string;
      artifacts: LibraryAgentDeliveryArtifact[];
    };

export type LibraryAgentDeliveryReadyData = {
  kind: "library-delivery-ready-v1";
  mode: "files" | "bundle";
  query: string;
  artifacts: LibraryAgentDeliveryArtifact[];
};

export async function planLibraryAgentDelivery(input: {
  query: string;
  userId: number;
}): Promise<LibraryAgentDeliveryPlan> {
  const query = input.query.trim();
  if (!query) return { status: "empty", message: "请说明要发送的资料名称、编号或主题。" };
  if (!(await checkLibraryExport(input.userId))) return { status: "denied" };

  const result = await searchLibraryDocumentSet({ query, limit: 20, userId: input.userId });
  const selected = selectLibraryDeliveryDocuments(query, result.documents);
  if (selected.length === 0) {
    return { status: "empty", message: `没有找到可发送的“${query}”资料，请补充文件名或资料编号。` };
  }
  return {
    status: "ready",
    query,
    documents: selected.map((document, index) => ({ ...document, index: index + 1 })),
  };
}

export async function createLibraryAgentDelivery(input: {
  query: string;
  versionUids: string[];
  userId: number;
}): Promise<LibraryAgentDeliveryRequest> {
  const plan = await planLibraryAgentDelivery({ query: input.query, userId: input.userId });
  if (plan.status !== "ready") return plan;
  const requested = Array.from(new Set(input.versionUids.map((value) => value.trim()).filter(Boolean)));
  if (requested.length === 0) return { status: "empty", message: "请选择要发送的资料。" };
  const available = new Map(plan.documents.map((document) => [document.versionUid, document]));
  if (requested.some((versionUid) => !available.has(versionUid))) {
    return { status: "empty", message: "待发送清单已变化，请重新确认资料范围。" };
  }
  const selected = requested.map((versionUid) => available.get(versionUid)!);

  if (shouldSendLibraryFilesDirectly(selected.length)) {
    const artifacts = await Promise.all(selected.map(async (document) => {
      const file = await getLibraryFileMetadataByVersionUid(document.versionUid, input.userId);
      return {
        source: "library-version" as const,
        artifactId: document.versionUid,
        fileName: file.fileName,
        fileSizeBytes: file.size,
        itemCount: 1,
      };
    }));
    return { status: "ready", mode: "files", query: plan.query, artifacts };
  }

  const command = buildCreateLibraryExportCommand({
    userId: input.userId,
    selection: selected.map((document) => ({
      documentUid: document.documentUid,
      versionUid: document.versionUid,
    })),
    includePreviews: false,
  });
  if (!command.ok) throw new Error(command.issue.message);
  const job = await createLibraryExport(command.data);
  if (job.status !== "succeeded" || !job.fileSizeBytes) {
    throw new Error("Library export did not produce a file");
  }
  return {
    status: "ready",
    mode: "bundle",
    query: plan.query,
    artifacts: [{
      source: "library-export",
      artifactId: job.exportUid,
      fileName: "资料库.zip",
      fileSizeBytes: job.fileSizeBytes,
      itemCount: selected.length,
    }],
  };
}

export function libraryDeliveryReadyData(value: unknown): LibraryAgentDeliveryReadyData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Partial<LibraryAgentDeliveryReadyData>;
  if (data.kind !== "library-delivery-ready-v1" || (data.mode !== "files" && data.mode !== "bundle") || typeof data.query !== "string" || !Array.isArray(data.artifacts)) return null;
  const artifacts = data.artifacts.filter((artifact): artifact is LibraryAgentDeliveryArtifact => Boolean(
    artifact
    && typeof artifact === "object"
    && (artifact.source === "library-export" || artifact.source === "library-version")
    && typeof artifact.artifactId === "string"
    && typeof artifact.fileName === "string"
    && typeof artifact.fileSizeBytes === "number"
    && typeof artifact.itemCount === "number",
  ));
  return artifacts.length === data.artifacts.length ? { kind: data.kind, mode: data.mode, query: data.query, artifacts } : null;
}
