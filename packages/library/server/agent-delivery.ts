import "server-only";

import {
  DIRECT_LIBRARY_FILE_LIMIT,
  isLibraryDeliveryRequest,
  resolveLibraryDeliveryQuery,
  selectLibraryDeliveryDocuments,
  shouldSendLibraryFilesDirectly,
  type LibraryDeliveryHistoryMessage,
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

export type LibraryAgentDeliveryRequest =
  | { status: "none" }
  | { status: "denied" }
  | { status: "empty"; message: string }
  | {
      status: "ready";
      mode: "files" | "bundle";
      query: string;
      artifacts: LibraryAgentDeliveryArtifact[];
    };

export async function createLibraryAgentDelivery(input: {
  message: string;
  userId: number;
  history?: LibraryDeliveryHistoryMessage[];
}): Promise<LibraryAgentDeliveryRequest> {
  if (!isLibraryDeliveryRequest(input.message)) return { status: "none" };

  const query = resolveLibraryDeliveryQuery(input.message, input.history);
  if (!query) {
    return { status: "empty", message: "请说明要发送的资料名称、编号或主题，我会直接发送匹配的文件。" };
  }
  if (!(await checkLibraryExport(input.userId))) return { status: "denied" };

  const result = await searchLibraryDocumentSet({ query, limit: 20, userId: input.userId });
  const selected = selectLibraryDeliveryDocuments(query, result.documents);
  if (selected.length === 0) {
    return { status: "empty", message: `没有找到可直接发送的“${query}”资料，请补充文件名或资料编号。` };
  }

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
    return { status: "ready", mode: "files", query, artifacts };
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
    query,
    artifacts: [{
      source: "library-export",
      artifactId: job.exportUid,
      fileName: "资料库.zip",
      fileSizeBytes: job.fileSizeBytes,
      itemCount: selected.length,
    }],
  };
}
