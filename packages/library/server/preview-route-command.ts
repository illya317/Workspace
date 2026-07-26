import "server-only";

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { serviceError } from "@workspace/platform/server/api";

import { getLibraryPreviewByDocumentId, getLibraryPreviewByVersionId } from "./preview-access";
import { parseLibraryPreviewRange } from "./preview-range";

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

function previewResponse(file: Awaited<ReturnType<typeof getLibraryPreviewByDocumentId>>, request: Request) {
  const parsedRange = parseLibraryPreviewRange(request.headers.get("range"), file.size);
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "Content-Type": file.contentType,
    "X-Content-Type-Options": "nosniff",
  };
  if (!parsedRange.ok) {
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders, "Content-Range": `bytes */${file.size}` },
    });
  }
  const range = parsedRange.range;
  const contentLength = range ? range.end - range.start + 1 : file.size;
  const stream = createReadStream(file.absolutePath, range ? { start: range.start, end: range.end } : undefined);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: range ? 206 : 200,
    headers: {
      ...commonHeaders,
      "Content-Length": String(contentLength),
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${file.size}` } : {}),
    },
  });
}

export async function executePreviewLibraryDocumentCommand(command: { id: number; userId: number; request: Request }) {
  try {
    const file = await getLibraryPreviewByDocumentId(command.id, command.userId);
    return previewResponse(file, command.request);
  } catch (error) {
    return previewError(error);
  }
}

export async function executePreviewLibraryDocumentVersionCommand(command: {
  id: number;
  versionId: number;
  userId: number;
  request: Request;
}) {
  try {
    const file = await getLibraryPreviewByVersionId(command.id, command.versionId, command.userId);
    return previewResponse(file, command.request);
  } catch (error) {
    return previewError(error);
  }
}
