import "server-only";

import { readFile } from "node:fs/promises";

import { libraryOfficeDocumentType } from "@workspace/library/constants";
import { prisma } from "@workspace/platform/server/prisma";
import {
  onlyOfficeSourceUrl,
  renderOnlyOfficeViewerResponse,
  signOnlyOfficeSourceToken,
  verifyOnlyOfficeSourceToken,
} from "@workspace/platform/server/onlyoffice-viewer";

import { getLibraryDocumentAccessPolicy } from "./permissions";
import { libraryOfficeDocumentKey, libraryOfficeSourcePath } from "./onlyoffice-contract";
import { resolveLibraryVersionProcessingInput } from "./version-content";
import { renderSpreadsheetPreviewHtml } from "./spreadsheet-preview";

const SOURCE_TOKEN_ISSUER = "workspace-library";
const SOURCE_TOKEN_AUDIENCE = "library-office-source";
const SOURCE_TOKEN_OPTIONS = {
  issuer: SOURCE_TOKEN_ISSUER,
  audience: SOURCE_TOKEN_AUDIENCE,
  expiration: "10m",
} as const;

type OfficeSourceClaims = {
  documentId: number;
  versionId: number;
  versionUid: string;
  checksumSha256: string;
};

const LOCAL_SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "ods"]);

function shouldRenderLocalSpreadsheetPreview(request: Request, extension: string) {
  if (process.env.NODE_ENV === "production" || !LOCAL_SPREADSHEET_EXTENSIONS.has(extension.toLowerCase())) {
    return false;
  }
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function officeError(message: string) {
  if (message === "Forbidden" || message === "Higher confidentiality required") return 403;
  if (message === "Not found" || message === "Version not found") return 404;
  if (message.includes("required") || message.includes("unavailable")) return 503;
  return 400;
}

async function loadOfficeVersion(documentId: number, versionId: number, userId: number) {
  const version = await prisma.libraryDocumentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      id: true,
      versionUid: true,
      fileName: true,
      extension: true,
      checksumSha256: true,
      document: {
        select: {
          status: true,
          title: true,
          confidentialityLevel: true,
          generatorKey: true,
        },
      },
    },
  });
  if (!version) throw new Error("Version not found");
  if (version.document.status !== "active") throw new Error("Office preview unavailable");
  if (!(await getLibraryDocumentAccessPolicy(userId)).allows(version.document)) throw new Error("Forbidden");
  if (!version.checksumSha256 || !libraryOfficeDocumentType(version.extension)) {
    throw new Error("Office preview unavailable");
  }
  return version;
}

async function sourceToken(claims: OfficeSourceClaims) {
  return signOnlyOfficeSourceToken(claims, SOURCE_TOKEN_OPTIONS);
}

export async function verifyLibraryOfficeSourceToken(token: string): Promise<OfficeSourceClaims | null> {
  const payload = await verifyOnlyOfficeSourceToken(token, SOURCE_TOKEN_OPTIONS);
  if (
    !payload
    || !Number.isInteger(payload.documentId)
    || !Number.isInteger(payload.versionId)
    || typeof payload.versionUid !== "string"
    || typeof payload.checksumSha256 !== "string"
  ) return null;
  return payload as unknown as OfficeSourceClaims;
}

export async function renderLibraryOfficeViewerResponse(input: {
  documentId: number;
  versionId: number;
  userId: number;
  request: Request;
}) {
  try {
    const version = await loadOfficeVersion(input.documentId, input.versionId, input.userId);
    const extension = version.extension;
    const documentType = libraryOfficeDocumentType(extension);
    if (!extension || !documentType || !version.checksumSha256) throw new Error("Office preview unavailable");
    if (shouldRenderLocalSpreadsheetPreview(input.request, extension)) {
      const resolved = await resolveLibraryVersionProcessingInput(version.versionUid);
      const buffer = await readFile(resolved.input.absolutePath);
      const html = renderSpreadsheetPreviewHtml({
        buffer,
        title: version.document.title || version.fileName,
      });
      return new Response(html, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          "Content-Type": "text/html; charset=utf-8",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }
    const token = await sourceToken({
      documentId: input.documentId,
      versionId: version.id,
      versionUid: version.versionUid,
      checksumSha256: version.checksumSha256,
    });
    const sourceUrl = onlyOfficeSourceUrl(input.request, libraryOfficeSourcePath(input.documentId, version.id));
    sourceUrl.searchParams.set("token", token);
    return await renderOnlyOfficeViewerResponse({
      title: version.document.title || version.fileName,
      extension,
      documentKey: libraryOfficeDocumentKey(version.versionUid, version.checksumSha256),
      sourceUrl: sourceUrl.toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Office preview unavailable";
    return new Response(message, { status: officeError(message) });
  }
}

export async function serveLibraryOfficeSourceResponse(input: {
  documentId: number;
  versionId: number;
  token: string;
}) {
  const claims = await verifyLibraryOfficeSourceToken(input.token);
  if (!claims || claims.documentId !== input.documentId || claims.versionId !== input.versionId) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const resolved = await resolveLibraryVersionProcessingInput(claims.versionUid);
    if (
      resolved.version.id !== input.versionId
      || resolved.version.documentId !== input.documentId
      || resolved.input.checksumSha256 !== claims.checksumSha256
      || resolved.version.checksumSha256 !== claims.checksumSha256
      || !libraryOfficeDocumentType(resolved.version.extension)
    ) throw new Error("Original Office source unavailable");
    const buffer = await readFile(resolved.input.absolutePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(resolved.version.fileName)}`,
        "Content-Length": String(buffer.length),
        "Content-Type": resolved.input.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Original Office source unavailable", { status: 404 });
  }
}
