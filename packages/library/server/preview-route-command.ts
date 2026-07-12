import "server-only";

import { serviceError } from "@workspace/platform/server/api";

import { getLibraryPreviewByDocumentId, getLibraryPreviewByVersionId } from "./preview-access";

function previewError(error: unknown) {
  const message = error instanceof Error ? error.message : "Preview unavailable";
  if (message === "Forbidden" || message === "Higher confidentiality required") {
    return serviceError(message, 403);
  }
  if (message === "Not found" || message === "Preview unavailable") {
    return serviceError(message, 404);
  }
  if (message === "Preview artifact invalid") {
    return serviceError(message, 409);
  }
  return serviceError("Preview unavailable", 400);
}

export async function executePreviewLibraryDocumentCommand(command: { id: number; userId: number }) {
  try {
    const file = await getLibraryPreviewByDocumentId(command.id, command.userId);
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(file.size),
        "Content-Type": file.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return previewError(error);
  }
}

export async function executePreviewLibraryDocumentVersionCommand(command: {
  id: number;
  versionId: number;
  userId: number;
}) {
  try {
    const file = await getLibraryPreviewByVersionId(command.id, command.versionId, command.userId);
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(file.size),
        "Content-Type": file.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return previewError(error);
  }
}
